import type { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../config/env';
import { CertificateCryptoService } from './certificate-crypto.service';
import { PfxInspectorService } from './pfx-inspector.service';

function createMockConfig(values: Partial<AppEnv>): ConfigService<AppEnv, true> {
  return {
    get: (key: keyof AppEnv) => values[key],
  } as unknown as ConfigService<AppEnv, true>;
}

function generateTestPfx(options: {
  cn: string;
  password: string;
  daysOffsetStart?: number;
  daysOffsetEnd?: number;
}): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '012345';

  const now = Date.now();
  cert.validity.notBefore = new Date(
    now + (options.daysOffsetStart ?? -1) * 86400_000,
  );
  cert.validity.notAfter = new Date(
    now + (options.daysOffsetEnd ?? 365) * 86400_000,
  );

  const attrs = [
    { name: 'commonName', value: options.cn },
    { name: 'countryName', value: 'BR' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', clientAuth: true },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert],
    options.password,
    { algorithm: '3des' },
  );
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}

describe('CertificateCryptoService', () => {
  const masterKey =
    'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

  it('criptografa e descriptografa PFX e senha com AES-256-GCM', () => {
    const service = new CertificateCryptoService(
      createMockConfig({ NODE_ENV: 'production', CERT_MASTER_KEY: masterKey }),
    );

    const rawPfx = Buffer.from('conteudo-binario-pfx-teste');
    const encPfx = service.encryptBuffer(rawPfx);
    const decPfx = service.decryptBuffer(
      encPfx.ciphertext,
      encPfx.iv,
      encPfx.authTag,
    );
    expect(decPfx.equals(rawPfx)).toBe(true);

    const encPass = service.encryptText('SenhaSuperSecreta!123');
    const decPass = service.decryptText(
      encPass.ciphertextBase64,
      encPass.iv,
      encPass.authTag,
    );
    expect(decPass).toBe('SenhaSuperSecreta!123');
  });

  it('falha ao descriptografar se authTag for adulterado', () => {
    const service = new CertificateCryptoService(
      createMockConfig({ NODE_ENV: 'production', CERT_MASTER_KEY: masterKey }),
    );
    const enc = service.encryptText('segredo');
    const tamperedTag = 'ff'.repeat(16);
    expect(() =>
      service.decryptText(enc.ciphertextBase64, enc.iv, tamperedTag),
    ).toThrow();
  });

  it('exige CERT_MASTER_KEY real em produção/VPS', () => {
    expect(
      () =>
        new CertificateCryptoService(
          createMockConfig({
            NODE_ENV: 'production',
            CERT_MASTER_KEY:
              '0000000000000000000000000000000000000000000000000000000000000000',
          }),
        ),
    ).toThrow();
  });
});

describe('PfxInspectorService', () => {
  const inspector = new PfxInspectorService();

  it('extrai metadados ICP-Brasil, valida TLS e aceita matriz/filial', () => {
    const pfx = generateTestPfx({
      cn: 'EMPRESA MODELO LTDA:12345678000195',
      password: 'senha-a1-teste',
    });

    const result = inspector.inspect(pfx, 'senha-a1-teste');
    expect(result.subjectDocument).toBe('12345678000195');
    expect(result.supportsClientAuth).toBe(true);
    expect(result.supportsDigitalSignature).toBe(true);
    expect(result.fingerprint).toHaveLength(64);

    // Mesma raiz CNPJ (filial 0002) é compatível; outro CNPJ falha
    expect(
      inspector.matchesCompanyDocument(result.subjectDocument, '12345678000276'),
    ).toBe(true);
    expect(
      inspector.matchesCompanyDocument(result.subjectDocument, '98765432000100'),
    ).toBe(false);
  });

  it('rejeita senha incorreta', () => {
    const pfx = generateTestPfx({
      cn: 'EMPRESA MODELO LTDA:12345678000195',
      password: 'senha-correta',
    });

    expect(() => inspector.inspect(pfx, 'senha-errada')).toThrow();
  });

  it('rejeita certificado A1 expirado', () => {
    const pfx = generateTestPfx({
      cn: 'EMPRESA EXPIRADA LTDA:12345678000195',
      password: 'senha',
      daysOffsetStart: -30,
      daysOffsetEnd: -1,
    });

    expect(() => inspector.inspect(pfx, 'senha')).toThrow(/expirado/i);
  });
});

