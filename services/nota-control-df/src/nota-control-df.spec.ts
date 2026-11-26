import type {
  MtlsRequestOptions,
  MtlsResponse,
  MtlsTransport,
} from '@nfse-hub/nfse-types';
import * as forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { NotaControlDfProvider } from './index';

function generatePfx(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  const attrs = [{ name: 'commonName', value: 'PRESTADOR DF:12345678000195' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

describe('NotaControlDfProvider (Manual v1.01 SOAP)', () => {
  it('envia envelope SOAP Document/Literal wrapped com cabeçalho 1.01 e interpreta GerarNfseResposta', async () => {
    const pfxBuffer = generatePfx('df-pass');
    const captured: MtlsRequestOptions[] = [];

    const innerResponse =
      '<GerarNfseResposta xmlns="http://www.sped.fazenda.gov.br/nfse"><ListaNfse><CompNfse><Nfse><InfNfse Id="NFS530010812345"><nNFSe>20260001</nNFSe></InfNfse></Nfse></CompNfse></ListaNfse></GerarNfseResposta>';

    const soapResponse = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GerarNfseResponse xmlns="http://www.sped.fazenda.gov.br/nfse"><GerarNfseResult>${escapeXml(innerResponse)}</GerarNfseResult></GerarNfseResponse></soap:Body></soap:Envelope>`;

    const transport: MtlsTransport = {
      request: async (opts): Promise<MtlsResponse> => {
        captured.push(opts);
        return { statusCode: 200, headers: {}, body: soapResponse };
      },
    };

    const provider = new NotaControlDfProvider({
      deps: {
        mtlsTransport: transport,
        getCertificate: async () => ({
          certificateId: 'cert-df',
          companyId: 'comp-df',
          pfxBuffer,
          passphrase: 'df-pass',
          subjectDocument: '12345678000195',
          expiresAt: new Date(Date.now() + 86400_000),
        }),
        getCompanyContext: async () => ({
          companyId: 'comp-df',
          tenantId: 't-1',
          document: '12345678000195',
          municipalReg: '0711122200100',
          municipalityCode: '5300108',
          simplesNacionalOpt: 1,
          environment: 'HOMOLOGATION',
          dpsSeries: '1',
          layoutVersion: '1.01',
        }),
        allocateDpsNumber: async () => 5n,
      },
    });

    const res = await provider.issue({
      companyId: 'comp-df',
      municipalityCode: '5300108',
      serviceCode: '010701',
      competenceDate: '2026-11-24',
      idempotencyKey: 'idem-df-1',
      customer: { document: '98765432000100', name: 'Tomador DF Ltda' },
      service: { description: 'Auditoria fiscal', amount: 2000, issRate: 2 },
    });

    expect(res.status).toBe('authorized');
    expect(res.invoiceNumber).toBe('20260001');
    expect(res.accessKey).toBe('530010812345');
    expect(captured[0].url).toBe(
      'https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx',
    );
    expect(captured[0].headers?.SOAPAction).toBe(
      'http://www.sped.fazenda.gov.br/nfse/GerarNfse',
    );
    expect(String(captured[0].body)).toContain('<versaoDados>1.01</versaoDados>');
    expect(String(captured[0].body)).toContain('<IBSCBS>');
  });

  it('interpreta ListaMensagemRetorno em caso de rejeição fiscal', async () => {
    const pfxBuffer = generatePfx('df-pass');
    const innerError =
      '<GerarNfseResposta xmlns="http://www.sped.fazenda.gov.br/nfse"><ListaMensagemRetorno><MensagemRetorno><Codigo>E001</Codigo><Mensagem>Inscrição municipal inválida</Mensagem><Correcao>Corrija o campo IM</Correcao></MensagemRetorno></ListaMensagemRetorno></GerarNfseResposta>';

    const soapError = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GerarNfseResponse><GerarNfseResult>${escapeXml(innerError)}</GerarNfseResult></GerarNfseResponse></soap:Body></soap:Envelope>`;

    const provider = new NotaControlDfProvider({
      deps: {
        mtlsTransport: {
          request: async () => ({
            statusCode: 200,
            headers: {},
            body: soapError,
          }),
        },
        getCertificate: async () => ({
          certificateId: 'cert-df',
          companyId: 'comp-df',
          pfxBuffer,
          passphrase: 'df-pass',
          subjectDocument: '12345678000195',
          expiresAt: new Date(Date.now() + 86400_000),
        }),
        getCompanyContext: async () => ({
          companyId: 'comp-df',
          tenantId: 't-1',
          document: '12345678000195',
          municipalReg: '0711122200100',
          municipalityCode: '5300108',
          simplesNacionalOpt: 1,
          environment: 'HOMOLOGATION',
          dpsSeries: '1',
        }),
        allocateDpsNumber: async () => 6n,
      },
    });

    const res = await provider.issue({
      companyId: 'comp-df',
      municipalityCode: '5300108',
      serviceCode: '010701',
      competenceDate: '2026-11-24',
      idempotencyKey: 'idem-df-2',
      customer: { document: '98765432000100', name: 'Tomador DF Ltda' },
      service: { description: 'Auditoria fiscal', amount: 2000 },
    });

    expect(res.status).toBe('rejected');
    expect(res.errors?.[0]).toEqual({
      code: 'E001',
      message: 'Inscrição municipal inválida',
      correction: 'Corrija o campo IM',
    });
  });
});
