import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptVaultBuffer,
  decryptVaultText,
  encryptVaultBuffer,
  encryptVaultText,
  resolveVaultMasterKey,
  type EncryptedBufferPayload,
  type EncryptedTextPayload,
} from '@nfse-hub/xml-engine';
import type { AppEnv } from '../config/env';

@Injectable()
export class CertificateCryptoService {
  private readonly logger = new Logger(CertificateCryptoService.name);
  private readonly masterKey: Buffer;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.masterKey = resolveVaultMasterKey({
      nodeEnv: this.config.get('NODE_ENV', { infer: true }),
      configuredHexKey: this.config.get('CERT_MASTER_KEY', { infer: true }),
      onDevFallbackWarning: () => {
        this.logger.warn(
          'Usando chave determinística de desenvolvimento para cofre A1. Configure CERT_MASTER_KEY real antes de enviar à VPS.',
        );
      },
    });
  }

  encryptBuffer(plain: Buffer): EncryptedBufferPayload {
    return encryptVaultBuffer(this.masterKey, plain);
  }

  decryptBuffer(ciphertext: Buffer, ivHex: string, authTagHex: string): Buffer {
    return decryptVaultBuffer(this.masterKey, ciphertext, ivHex, authTagHex);
  }

  encryptText(plainText: string): EncryptedTextPayload {
    return encryptVaultText(this.masterKey, plainText);
  }

  decryptText(
    ciphertextBase64: string,
    ivHex: string,
    authTagHex: string,
  ): string {
    return decryptVaultText(
      this.masterKey,
      ciphertextBase64,
      ivHex,
      authTagHex,
    );
  }
}
