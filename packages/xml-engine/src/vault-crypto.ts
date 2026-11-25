import * as crypto from 'node:crypto';
import type { DecryptedCertificateMaterial } from '@nfse-hub/nfse-types';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
export const ZERO_DEV_MASTER_KEY =
  '0000000000000000000000000000000000000000000000000000000000000000';

export interface EncryptedBufferPayload {
  ciphertext: Buffer;
  iv: string;
  authTag: string;
}

export interface EncryptedTextPayload {
  ciphertextBase64: string;
  iv: string;
  authTag: string;
}

export interface StoredCertificateCipherRecord {
  id: string;
  companyId: string;
  subjectDocument: string;
  expiresAt: Date;
  encryptedPfx: Uint8Array | Buffer;
  pfxIv: string;
  pfxAuthTag: string;
  encryptedPassword: string;
  passwordIv: string;
  passwordAuthTag: string;
}

/**
 * Resolve a chave mestra AES-256-GCM (32 bytes).
 * Em produção/VPS exige chave real configurada; em test-machine aceita fallback de dev.
 */
export function resolveVaultMasterKey(params: {
  nodeEnv?: string;
  configuredHexKey?: string;
  onDevFallbackWarning?: () => void;
}): Buffer {
  const { nodeEnv, configuredHexKey, onDevFallbackWarning } = params;

  if (nodeEnv === 'production') {
    if (!configuredHexKey || configuredHexKey === ZERO_DEV_MASTER_KEY) {
      throw new Error(
        'CERT_MASTER_KEY real (64 caracteres hex) é obrigatória em produção/VPS.',
      );
    }
    return Buffer.from(configuredHexKey, 'hex');
  }

  if (!configuredHexKey || configuredHexKey === ZERO_DEV_MASTER_KEY) {
    onDevFallbackWarning?.();
    return crypto
      .createHash('sha256')
      .update('nfse-hub-local-test-machine-master-key')
      .digest();
  }

  return Buffer.from(configuredHexKey, 'hex');
}

export function encryptVaultBuffer(
  masterKey: Buffer,
  plain: Buffer,
): EncryptedBufferPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

export function decryptVaultBuffer(
  masterKey: Buffer,
  ciphertext: Buffer,
  ivHex: string,
  authTagHex: string,
): Buffer {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptVaultText(
  masterKey: Buffer,
  plainText: string,
): EncryptedTextPayload {
  const encrypted = encryptVaultBuffer(
    masterKey,
    Buffer.from(plainText, 'utf8'),
  );
  return {
    ciphertextBase64: encrypted.ciphertext.toString('base64'),
    iv: encrypted.iv,
    authTag: encrypted.authTag,
  };
}

export function decryptVaultText(
  masterKey: Buffer,
  ciphertextBase64: string,
  ivHex: string,
  authTagHex: string,
): string {
  const decrypted = decryptVaultBuffer(
    masterKey,
    Buffer.from(ciphertextBase64, 'base64'),
    ivHex,
    authTagHex,
  );
  return decrypted.toString('utf8');
}

/**
 * Descriptografa um registro do PostgreSQL estritamente em memória para uso de API/Worker.
 */
export function decryptCertificateRecord(
  masterKey: Buffer,
  record: StoredCertificateCipherRecord,
): DecryptedCertificateMaterial {
  const pfxBuffer = decryptVaultBuffer(
    masterKey,
    Buffer.from(record.encryptedPfx),
    record.pfxIv,
    record.pfxAuthTag,
  );
  const passphrase = decryptVaultText(
    masterKey,
    record.encryptedPassword,
    record.passwordIv,
    record.passwordAuthTag,
  );

  return {
    certificateId: record.id,
    companyId: record.companyId,
    pfxBuffer,
    passphrase,
    subjectDocument: record.subjectDocument,
    expiresAt: record.expiresAt,
  };
}

