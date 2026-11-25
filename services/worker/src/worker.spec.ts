import { ProviderRegistry } from '@nfse-hub/municipality-registry';
import type { NfseEmissionResult, NfseProvider } from '@nfse-hub/nfse-types';
import {
  encryptVaultBuffer,
  encryptVaultText,
  resolveVaultMasterKey,
} from '@nfse-hub/xml-engine';
import * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import type { TLSSocket } from 'node:tls';
import * as forge from 'node-forge';
import { describe, expect, it, vi } from 'vitest';
import { MtlsHttpClient } from './mtls/mtls-http-client';
import {
  NfseEmissionProcessor,
  type WorkerEmissionStore,
} from './processors/nfse-emission.processor';
import { WorkerCertificateVault } from './vault/worker-certificate-vault';

function createCaAndClientPfx(password: string) {
  // CA autoassinada de teste
  const caKeys = forge.pki.rsa.generateKeyPair(2048);
  const caCert = forge.pki.createCertificate();
  caCert.publicKey = caKeys.publicKey;
  caCert.serialNumber = '01';
  caCert.validity.notBefore = new Date(Date.now() - 86400_000);
  caCert.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  const caAttrs = [{ name: 'commonName', value: 'Test CA' }];
  caCert.setSubject(caAttrs);
  caCert.setIssuer(caAttrs);
  caCert.setExtensions([{ name: 'basicConstraints', cA: true }]);
  caCert.sign(caKeys.privateKey, forge.md.sha256.create());

  // Certificado do Servidor localhost
  const srvKeys = forge.pki.rsa.generateKeyPair(2048);
  const srvCert = forge.pki.createCertificate();
  srvCert.publicKey = srvKeys.publicKey;
  srvCert.serialNumber = '02';
  srvCert.validity.notBefore = new Date(Date.now() - 86400_000);
  srvCert.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  srvCert.setSubject([{ name: 'commonName', value: 'localhost' }]);
  srvCert.setIssuer(caAttrs);
  srvCert.setExtensions([
    {
      name: 'subjectAltName',
      altNames: [{ type: 2, value: 'localhost' }],
    },
    { name: 'extKeyUsage', serverAuth: true },
  ]);
  srvCert.sign(caKeys.privateKey, forge.md.sha256.create());

  // Certificado Cliente A1 (mTLS)
  const cliKeys = forge.pki.rsa.generateKeyPair(2048);
  const cliCert = forge.pki.createCertificate();
  cliCert.publicKey = cliKeys.publicKey;
  cliCert.serialNumber = '03';
  cliCert.validity.notBefore = new Date(Date.now() - 86400_000);
  cliCert.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  cliCert.setSubject([{ name: 'commonName', value: 'PRESTADOR A1:12345678000195' }]);
  cliCert.setIssuer(caAttrs);
  cliCert.setExtensions([
    { name: 'keyUsage', digitalSignature: true },
    { name: 'extKeyUsage', clientAuth: true },
  ]);
  cliCert.sign(caKeys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    cliKeys.privateKey,
    [cliCert, caCert],
    password,
    { algorithm: '3des' },
  );

  return {
    caPem: forge.pki.certificateToPem(caCert),
    serverKeyPem: forge.pki.privateKeyToPem(srvKeys.privateKey),
    serverCertPem: forge.pki.certificateToPem(srvCert),
    clientPfx: Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary'),
  };
}

describe('Automação VPS: Cofre A1 + Handshake mTLS em memória', () => {
  it('descriptografa A1 do Postgres e realiza autenticação mTLS em memória com sucesso', async () => {
    const pass = 'a1-pass-mtls';
    const pki = createCaAndClientPfx(pass);
    const hexKey =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const masterKey = resolveVaultMasterKey({
      nodeEnv: 'production',
      configuredHexKey: hexKey,
    });

    const encPfx = encryptVaultBuffer(masterKey, pki.clientPfx);
    const encPass = encryptVaultText(masterKey, pass);

    const vault = new WorkerCertificateVault(
      {
        findActiveByCompany: async () => ({
          id: 'cert-1',
          companyId: 'comp-1',
          subjectDocument: '12345678000195',
          expiresAt: new Date(Date.now() + 86400_000),
          encryptedPfx: encPfx.ciphertext,
          pfxIv: encPfx.iv,
          pfxAuthTag: encPfx.authTag,
          encryptedPassword: encPass.ciphertextBase64,
          passwordIv: encPass.iv,
          passwordAuthTag: encPass.authTag,
        }),
      },
      { nodeEnv: 'production', certMasterKey: hexKey },
    );

    const material = await vault.getActiveMaterial('tenant-1', 'comp-1');

    const server = https.createServer(
      {
        key: pki.serverKeyPem,
        cert: pki.serverCertPem,
        ca: pki.caPem,
        requestCert: true,
        rejectUnauthorized: true,
      },
      (req, res) => {
        const tlsSocket = req.socket as TLSSocket;
        const peer = tlsSocket.getPeerCertificate();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            authorized: tlsSocket.authorized,
            cn: peer.subject?.CN,
          }),
        );
      },
    );

    await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const client = new MtlsHttpClient();
      const response = await client.request({
        url: `https://localhost:${port}/nfse`,
        method: 'POST',
        body: '<ping/>',
        certificate: material,
        ca: pki.caPem,
      });

      expect(response.statusCode).toBe(200);
      const parsed = JSON.parse(response.body) as {
        authorized: boolean;
        cn: string;
      };
      expect(parsed.authorized).toBe(true);
      expect(parsed.cn).toBe('PRESTADOR A1:12345678000195');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('NfseEmissionProcessor: Idempotência e Consulta após Timeout', () => {
  it('não reemite nota já AUTHORIZED', async () => {
    const issueSpy = vi.fn();
    const consultSpy = vi.fn();
    const registry = new ProviderRegistry();
    registry.register({
      providerCode: 'NATIONAL_SEFIN',
      supports: async () => true,
      getMunicipalParameters: async () => ({}),
      issue: issueSpy,
      consult: consultSpy,
      cancel: async () => ({ status: 'cancelled', provider: 'NATIONAL_SEFIN' }),
    });

    const store: WorkerEmissionStore = {
      getInvoiceForProcessing: async () => ({
        id: 'inv-1',
        tenantId: 't-1',
        companyId: 'c-1',
        providerCode: 'NATIONAL_SEFIN',
        status: 'AUTHORIZED',
        dpsSeries: '1',
        dpsNumber: 1n,
        accessKey: 'CHAVE-50',
        payload: {},
        dps: null,
      }),
      markProcessing: vi.fn(),
      saveResult: vi.fn(),
      recordTransmission: vi.fn(),
    };

    const processor = new NfseEmissionProcessor(
      store,
      { getActiveMaterial: vi.fn() },
      registry,
    );

    const res = await processor.process({ tenantId: 't-1', invoiceId: 'inv-1' });
    expect(res.status).toBe('authorized');
    expect(issueSpy).not.toHaveBeenCalled();
    expect(consultSpy).not.toHaveBeenCalled();
  });

  it('consulta estado anterior em vez de reemitir quando status é UNKNOWN', async () => {
    const issueSpy = vi.fn();
    const consultResult: NfseEmissionResult = {
      status: 'authorized',
      provider: 'NATIONAL_SEFIN',
      accessKey: 'CHAVE-RECUPERADA',
    };
    const consultSpy = vi.fn(async () => consultResult);

    const provider: NfseProvider = {
      providerCode: 'NATIONAL_SEFIN',
      supports: async () => true,
      getMunicipalParameters: async () => ({}),
      issue: issueSpy,
      consult: consultSpy,
      cancel: async () => ({ status: 'cancelled', provider: 'NATIONAL_SEFIN' }),
    };

    const registry = new ProviderRegistry();
    registry.register(provider);

    const saveResultSpy = vi.fn();
    const store: WorkerEmissionStore = {
      getInvoiceForProcessing: async () => ({
        id: 'inv-2',
        tenantId: 't-1',
        companyId: 'c-1',
        providerCode: 'NATIONAL_SEFIN',
        status: 'UNKNOWN',
        dpsSeries: '1',
        dpsNumber: 2n,
        accessKey: null,
        payload: {},
        dps: { id: 'dps-2', dpsKey: 'DPS53001082...' },
      }),
      markProcessing: vi.fn(),
      saveResult: saveResultSpy,
      recordTransmission: vi.fn(),
    };

    const processor = new NfseEmissionProcessor(
      store,
      {
        getActiveMaterial: async () => ({
          certificateId: 'cert-1',
          companyId: 'c-1',
          pfxBuffer: Buffer.from('pfx'),
          passphrase: '123',
          subjectDocument: '12345678000195',
          expiresAt: new Date(Date.now() + 86400_000),
        }),
      },
      registry,
    );

    const res = await processor.process({ tenantId: 't-1', invoiceId: 'inv-2' });
    expect(res.status).toBe('authorized');
    expect(consultSpy).toHaveBeenCalledTimes(1);
    expect(issueSpy).not.toHaveBeenCalled();
    expect(saveResultSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'authorized', accessKey: 'CHAVE-RECUPERADA' }),
    );
  });

  it('processa cancelamento (INVOICE_CANCEL_REQUESTED) com A1 ativo e atualiza evento', async () => {
    const cancelSpy = vi.fn(async () => ({
      status: 'cancelled' as const,
      provider: 'NATIONAL_SEFIN',
      accessKey: 'CHAVE-50',
      protocol: 'EVT-1',
    }));
    const saveCancelSpy = vi.fn();
    const registry = new ProviderRegistry();
    registry.register({
      providerCode: 'NATIONAL_SEFIN',
      supports: async () => true,
      getMunicipalParameters: async () => ({}),
      issue: vi.fn(),
      consult: vi.fn(),
      cancel: cancelSpy,
    });

    const store: WorkerEmissionStore = {
      getInvoiceForProcessing: async () => ({
        id: 'inv-cancel-1',
        tenantId: 't-1',
        companyId: 'c-1',
        providerCode: 'NATIONAL_SEFIN',
        status: 'AUTHORIZED',
        dpsSeries: '1',
        dpsNumber: 10n,
        accessKey: 'CHAVE-50',
        payload: {},
        dps: null,
      }),
      markProcessing: vi.fn(),
      saveResult: vi.fn(),
      recordTransmission: vi.fn(),
      saveCancelResult: saveCancelSpy,
    };

    const processor = new NfseEmissionProcessor(
      store,
      {
        getActiveMaterial: async () => ({
          certificateId: 'cert-1',
          companyId: 'c-1',
          pfxBuffer: Buffer.from('pfx'),
          passphrase: '123',
          subjectDocument: '12345678000195',
          expiresAt: new Date(Date.now() + 86400_000),
        }),
      },
      registry,
    );

    const res = await processor.processCancel({
      tenantId: 't-1',
      invoiceId: 'inv-cancel-1',
      eventId: 'evt-1',
      reasonCode: '1',
      reason: 'Erro na emissão da nota fiscal',
    });

    expect(res.status).toBe('cancelled');
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(saveCancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 'inv-cancel-1',
        eventId: 'evt-1',
        status: 'CANCELLED',
      }),
    );
  });
});

