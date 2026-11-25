import * as forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import {
  DpsXmlValidator,
  XmlDsigSigner,
  buildDpsId,
  buildDpsXml,
  buildSoapHeaderXml,
  decryptCertificateRecord,
  encryptVaultBuffer,
  encryptVaultText,
  formatNfseDateTime,
  generateDanfsePdf,
  resolveVaultMasterKey,
} from './index';

function generatePfxInMemory(cn: string, password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  const attrs = [{ name: 'commonName', value: cn }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

describe('xml-engine: DPS Builder, Validator e XMLDSig v1.01', () => {
  it('gera TSIdDPS com exatamente 45 posições para CNPJ e CPF', () => {
    const idCnpj = buildDpsId({
      municipalityCode: '5300108',
      providerDocument: '12.345.678/0001-95',
      series: '1',
      number: 42,
    });
    expect(idCnpj).toBe('DPS530010821234567800019500001000000000000042');
    expect(idCnpj).toHaveLength(45);

    const idCpf = buildDpsId({
      municipalityCode: '5300108',
      providerDocument: '123.456.789-01',
      series: '1',
      number: 1,
    });
    expect(idCpf).toBe('DPS530010810001234567890100001000000000000001');
    expect(idCpf).toHaveLength(45);
  });

  it('constrói, assina com XMLDSig (sem tags proibidas) e valida assinatura', () => {
    const pfxBuffer = generatePfxInMemory(
      'PRESTADOR TESTE:12345678000195',
      'teste123',
    );

    const built = buildDpsXml({
      environment: 'HOMOLOGATION',
      appVersion: 'nfse-hub-1.0',
      dpsSeries: '1',
      dpsNumber: 10,
      issuedAtUtc: '2026-11-24T18:00:00-03:00',
      layoutVersion: '1.01',
      finNFSe: '0',
      provider: {
        document: '12345678000195',
        municipalReg: '0712345600100',
        municipalityCode: '5300108',
        simplesNacionalOpt: 1,
      },
      emission: {
        companyId: 'comp-1',
        municipalityCode: '5300108',
        serviceCode: '010701',
        competenceDate: '2026-11-24',
        idempotencyKey: 'idem-1',
        customer: {
          document: '98765432000100',
          name: 'Tomador Exemplo Ltda',
          email: 'fiscal@tomador.com.br',
          address: {
            cityCode: '3106200',
            zipCode: '30130-000',
            street: 'Av Afonso Pena',
            number: '1500',
            district: 'Centro',
          },
        },
        service: {
          description: 'Consultoria contábil mensal',
          amount: 1500,
          issRate: 2,
        },
      },
    });

    const signer = new XmlDsigSigner();
    const signedXml = signer.signXml({
      xml: built.xml,
      referenceTag: 'infDPS',
      certificate: { pfxBuffer, passphrase: 'teste123' },
    });

    const validator = new DpsXmlValidator();
    const validation = validator.validateDps({
      xml: signedXml,
      expectedVersion: '1.01',
      requireSignature: true,
    });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(signedXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(signedXml).toContain('<tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>');
    expect(signedXml).toContain(
      '<end><endNac><cMun>3106200</cMun><CEP>30130000</CEP></endNac><xLgr>Av Afonso Pena</xLgr><nro>1500</nro><xBairro>Centro</xBairro></end><email>fiscal@tomador.com.br</email>',
    );
    expect(formatNfseDateTime(new Date('2026-11-24T23:53:00.123Z'))).toBe(
      '2026-11-24T20:53:00-03:00',
    );
    expect(signer.verifyXmlSignature(signedXml)).toBe(true);

    // Se adulterar o valor após assinar, a assinatura deve falhar
    const tampered = signedXml.replace('1500.00', '9999.00');
    expect(signer.verifyXmlSignature(tampered)).toBe(false);
  });

  it('gera cabeçalho SOAP versão 1.00 e 1.01 conforme Seção 14', () => {
    expect(buildSoapHeaderXml('1.01')).toContain('<versaoDados>1.01</versaoDados>');
    expect(buildSoapHeaderXml('1.00')).toContain('<versaoDados>1.00</versaoDados>');
  });

  it('descriptografa registro do cofre AES-256-GCM em memória', () => {
    const masterKey = resolveVaultMasterKey({
      nodeEnv: 'production',
      configuredHexKey:
        '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
    });

    const rawPfx = Buffer.from('pfx-bytes');
    const encPfx = encryptVaultBuffer(masterKey, rawPfx);
    const encPass = encryptVaultText(masterKey, 'segredo-a1');

    const material = decryptCertificateRecord(masterKey, {
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
    });

    expect(material.pfxBuffer.equals(rawPfx)).toBe(true);
    expect(material.passphrase).toBe('segredo-a1');
  });

  it('gera PDF DANFSe válido a partir do XML autorizado', async () => {
    const sampleXml = `
      <CompNfse>
        <Nfse>
          <InfNfse Id="NFS5300108212345678000195000000000010526111234567890">
            <xLocEmi>Brasília - DF</xLocEmi>
            <nNFSe>105</nNFSe>
            <dhProc>2026-11-24T18:00:00-03:00</dhProc>
            <emit><CNPJ>12345678000195</CNPJ><IM>0712345600100</IM><xNome>Contabilidade Exemplo Ltda</xNome></emit>
            <valores><pAliqAplic>2.00</pAliqAplic><vISSQN>30.00</vISSQN><vLiq>1470.00</vLiq></valores>
            <DPS><infDPS><dCompet>2026-11-24</dCompet><toma><CNPJ>98765432000100</CNPJ><xNome>Cliente Teste S/A</xNome></toma><serv><cServ><cTribNac>010701</cTribNac><xDescServ>Honorários contábeis</xDescServ></cServ></serv><valores><vServPrest><vServ>1500.00</vServ></vServPrest></valores></infDPS></DPS>
          </InfNfse>
        </Nfse>
      </CompNfse>`;

    const pdfBuffer = await generateDanfsePdf({ authorizedXml: sampleXml });
    expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBuffer.length).toBeGreaterThan(500);
  });
});

