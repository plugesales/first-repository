import type { DecryptedCertificateMaterial } from '@nfse-hub/nfse-types';
import {
  decryptCertificateRecord,
  resolveVaultMasterKey,
  type StoredCertificateCipherRecord,
} from '@nfse-hub/xml-engine';

export interface CertificateVaultRepository {
  findActiveByCompany(
    tenantId: string,
    companyId: string,
  ): Promise<StoredCertificateCipherRecord | null>;
}

/**
 * Lê e descriptografa em memória o certificado A1 da empresa no Worker da VPS.
 */
export class WorkerCertificateVault {
  private readonly masterKey: Buffer;

  constructor(
    private readonly repository: CertificateVaultRepository,
    env: { nodeEnv?: string; certMasterKey?: string },
  ) {
    this.masterKey = resolveVaultMasterKey({
      nodeEnv: env.nodeEnv,
      configuredHexKey: env.certMasterKey,
    });
  }

  async getActiveMaterial(
    tenantId: string,
    companyId: string,
  ): Promise<DecryptedCertificateMaterial> {
    const record = await this.repository.findActiveByCompany(
      tenantId,
      companyId,
    );

    if (!record) {
      throw new Error(
        `Nenhum certificado A1 ativo encontrado para a empresa ${companyId}.`,
      );
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new Error(
        `Certificado A1 expirado em ${record.expiresAt.toISOString()} para a empresa ${companyId}.`,
      );
    }

    return decryptCertificateRecord(this.masterKey, record);
  }
}

