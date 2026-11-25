export type CertificateType = 'A1' | 'A3';

export type CertificateStatus =
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'REVOKED'
  | 'INVALID';

export interface CertificateMetadata {
  id: string;
  companyId: string;
  tenantId: string;
  type: CertificateType;
  subjectName: string;
  subjectDocument: string;
  issuerName: string;
  serialNumber: string;
  fingerprint: string;
  validFrom: string;
  expiresAt: string;
  status: CertificateStatus;
  isActive: boolean;
  lastValidatedAt: string | null;
}

/**
 * Payload descriptografado mantido estritamente em memória no backend/worker da VPS.
 * Nunca deve ser serializado em resposta HTTP ou logs.
 */
export interface DecryptedCertificateMaterial {
  certificateId: string;
  companyId: string;
  pfxBuffer: Buffer;
  passphrase: string;
  subjectDocument: string;
  expiresAt: Date;
}

