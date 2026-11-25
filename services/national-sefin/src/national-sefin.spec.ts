import type {
  MtlsRequestOptions,
  MtlsResponse,
  MtlsTransport,
} from '@nfse-hub/nfse-types';
import * as forge from 'node-forge';
import * as zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { NationalSefinProvider } from './index';

function generatePfx(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  const attrs = [{ name: 'commonName', value: 'PRESTADOR:12345678000195' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

describe('NationalSefinProvider', () => {
  it('emite DPS assinada compactada em GZip+Base64 via mTLS e interpreta retorno autorizado', async () => {
    const pfxBuffer = generatePfx('sefin-pass');
    const capturedRequests: MtlsRequestOptions[] = [];

    const transport: MtlsTransport = {
      request: async (opts): Promise<MtlsResponse> => {
        capturedRequests.push(opts);
        const xmlRetorno = '<NFSe><infNFSe Id="NFS5300108..."/></NFSe>';
        return {
          statusCode: 201,
          headers: {},
          body: JSON.stringify({
            chaveAcesso: '530010822123456780001950000100000000000000126111234',
            nNFSe: '100',
            nfseXmlGZipB64: zlib
              .gzipSync(Buffer.from(xmlRetorno, 'utf8'))
              .toString('base64'),
          }),
        };
      },
    };

    const provider = new NationalSefinProvider({
      deps: {
        mtlsTransport: transport,
        getCertificate: async () => ({
          certificateId: 'cert-1',
          companyId: 'comp-1',
          pfxBuffer,
          passphrase: 'sefin-pass',
          subjectDocument: '12345678000195',
          expiresAt: new Date(Date.now() + 86400_000),
        }),
        getCompanyContext: async () => ({
          companyId: 'comp-1',
          tenantId: 't-1',
          document: '12345678000195',
          municipalReg: '07000111',
          municipalityCode: '5300108',
          simplesNacionalOpt: 1,
          environment: 'HOMOLOGATION',
          dpsSeries: '1',
          layoutVersion: '1.01',
        }),
        allocateDpsNumber: async () => 1n,
      },
    });

    const result = await provider.issue({
      companyId: 'comp-1',
      municipalityCode: '5300108',
      serviceCode: '010701',
      competenceDate: '2026-11-24',
      idempotencyKey: 'idem-sefin-1',
      customer: { document: '98765432000100', name: 'Cliente Exemplo' },
      service: { description: 'Suporte técnico', amount: 500, issRate: 2 },
    });

    expect(result.status).toBe('authorized');
    expect(result.invoiceNumber).toBe('100');
    expect(result.xml).toContain('<NFSe>');
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].url).toContain(
      'sefin.producaorestrita.nfse.gov.br/sefinnacional/nfse',
    );

    const sentPayload = JSON.parse(String(capturedRequests[0].body)) as {
      dpsXmlGZipB64: string;
    };
    const decodedDps = zlib
      .gunzipSync(Buffer.from(sentPayload.dpsXmlGZipB64, 'base64'))
      .toString('utf8');
    expect(decodedDps).toContain('<Signature');
    expect(decodedDps).toContain('versao="1.01"');
    expect(decodedDps).toContain('<tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>');
  });

  it('retorna rejected com erros mapeados quando SEFIN retorna 400', async () => {
    const pfxBuffer = generatePfx('sefin-pass');
    const provider = new NationalSefinProvider({
      deps: {
        mtlsTransport: {
          request: async () => ({
            statusCode: 400,
            headers: {},
            body: JSON.stringify({
              erros: [
                {
                  Codigo: 'E0120',
                  Descricao: 'Código de serviço inválido para o município.',
                },
              ],
            }),
          }),
        },
        getCertificate: async () => ({
          certificateId: 'cert-1',
          companyId: 'comp-1',
          pfxBuffer,
          passphrase: 'sefin-pass',
          subjectDocument: '12345678000195',
          expiresAt: new Date(Date.now() + 86400_000),
        }),
        getCompanyContext: async () => ({
          companyId: 'comp-1',
          tenantId: 't-1',
          document: '12345678000195',
          municipalReg: '07000111',
          municipalityCode: '5300108',
          simplesNacionalOpt: 1,
          environment: 'HOMOLOGATION',
          dpsSeries: '1',
        }),
        allocateDpsNumber: async () => 2n,
      },
    });

    const result = await provider.issue({
      companyId: 'comp-1',
      municipalityCode: '5300108',
      serviceCode: '999999',
      competenceDate: '2026-11-24',
      idempotencyKey: 'idem-sefin-2',
      customer: { document: '98765432000100', name: 'Cliente' },
      service: { description: 'Serviço', amount: 100 },
    });

    expect(result.status).toBe('rejected');
    expect(result.errors?.[0]?.code).toBe('E0120');
  });
});
