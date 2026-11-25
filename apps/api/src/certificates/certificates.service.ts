import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AuthenticatedPrincipal,
  CertificateMetadata,
  CertificateStatus,
  DecryptedCertificateMaterial,
} from '@nfse-hub/nfse-types';
import { Certificate, CertificateStatus as PrismaCertificateStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateCryptoService } from './certificate-crypto.service';
import { PfxInspectorService } from './pfx-inspector.service';

const EXPIRING_SOON_DAYS = 30;

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CertificateCryptoService,
    private readonly inspector: PfxInspectorService,
    private readonly audit: AuditService,
  ) {}

  async uploadA1(params: {
    principal: AuthenticatedPrincipal;
    companyId: string;
    pfxBuffer: Buffer;
    password: string;
    ipAddress?: string;
  }): Promise<CertificateMetadata> {
    const company = await this.prisma.company.findFirst({
      where: {
        id: params.companyId,
        tenantId: params.principal.tenantId,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada neste escritório.');
    }

    const inspected = this.inspector.inspect(params.pfxBuffer, params.password);

    if (
      !this.inspector.matchesCompanyDocument(
        inspected.subjectDocument,
        company.document,
      )
    ) {
      throw new BadRequestException(
        `O certificado pertence ao documento ${inspected.subjectDocument}, incompatível com o prestador ${company.document}.`,
      );
    }

    const encryptedPfx = this.cryptoService.encryptBuffer(params.pfxBuffer);
    const encryptedPassword = this.cryptoService.encryptText(params.password);
    const computedStatus = this.computeStatus(inspected.expiresAt);
    const now = new Date();

    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.certificate.updateMany({
        where: {
          companyId: company.id,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      const existingSameFingerprint = await tx.certificate.findUnique({
        where: {
          companyId_fingerprint: {
            companyId: company.id,
            fingerprint: inspected.fingerprint,
          },
        },
      });

      if (existingSameFingerprint) {
        return tx.certificate.update({
          where: { id: existingSameFingerprint.id },
          data: {
            subjectName: inspected.subjectName,
            subjectDocument: inspected.subjectDocument,
            issuerName: inspected.issuerName,
            serialNumber: inspected.serialNumber,
            validFrom: inspected.validFrom,
            expiresAt: inspected.expiresAt,
            status: computedStatus as PrismaCertificateStatus,
            isActive: true,
            encryptedPfx: new Uint8Array(encryptedPfx.ciphertext),
            pfxIv: encryptedPfx.iv,
            pfxAuthTag: encryptedPfx.authTag,
            encryptedPassword: encryptedPassword.ciphertextBase64,
            passwordIv: encryptedPassword.iv,
            passwordAuthTag: encryptedPassword.authTag,
            lastValidatedAt: now,
          },
        });
      }

      return tx.certificate.create({
        data: {
          tenantId: params.principal.tenantId,
          companyId: company.id,
          type: 'A1',
          subjectName: inspected.subjectName,
          subjectDocument: inspected.subjectDocument,
          issuerName: inspected.issuerName,
          serialNumber: inspected.serialNumber,
          fingerprint: inspected.fingerprint,
          validFrom: inspected.validFrom,
          expiresAt: inspected.expiresAt,
          status: computedStatus as PrismaCertificateStatus,
          isActive: true,
          encryptedPfx: new Uint8Array(encryptedPfx.ciphertext),
          pfxIv: encryptedPfx.iv,
          pfxAuthTag: encryptedPfx.authTag,
          encryptedPassword: encryptedPassword.ciphertextBase64,
          passwordIv: encryptedPassword.iv,
          passwordAuthTag: encryptedPassword.authTag,
          keyVersion: 1,
          lastValidatedAt: now,
        },
      });
    });

    await this.audit.record({
      tenantId: params.principal.tenantId,
      userId: params.principal.userId,
      action: 'CERTIFICATE_A1_UPLOADED',
      resource: 'Certificate',
      resourceId: saved.id,
      metadata: {
        companyId: company.id,
        subjectDocument: saved.subjectDocument,
        fingerprint: saved.fingerprint,
        expiresAt: saved.expiresAt.toISOString(),
        supportsClientAuth: inspected.supportsClientAuth,
      },
      ipAddress: params.ipAddress,
    });

    return this.toMetadata(saved);
  }

  async listByTenant(tenantId: string): Promise<CertificateMetadata[]> {
    const records = await this.prisma.certificate.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { expiresAt: 'asc' }],
    });
    return records.map((record) => this.toMetadata(record));
  }

  async listByCompany(
    tenantId: string,
    companyId: string,
  ): Promise<CertificateMetadata[]> {
    const records = await this.prisma.certificate.findMany({
      where: { tenantId, companyId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return records.map((record) => this.toMetadata(record));
  }

  async verifyStoredCertificate(
    principal: AuthenticatedPrincipal,
    certificateId: string,
    ipAddress?: string,
  ): Promise<{
    verified: boolean;
    mTlsReady: boolean;
    metadata: CertificateMetadata;
  }> {
    const record = await this.prisma.certificate.findFirst({
      where: {
        id: certificateId,
        tenantId: principal.tenantId,
      },
    });

    if (!record) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    const material = this.decryptRecord(record);
    const inspected = this.inspector.inspect(
      material.pfxBuffer,
      material.passphrase,
    );
    const status = this.computeStatus(inspected.expiresAt);

    const updated = await this.prisma.certificate.update({
      where: { id: record.id },
      data: {
        status: status as PrismaCertificateStatus,
        lastValidatedAt: new Date(),
      },
    });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'CERTIFICATE_A1_VERIFIED',
      resource: 'Certificate',
      resourceId: record.id,
      metadata: {
        companyId: record.companyId,
        status,
        mTlsReady: inspected.supportsClientAuth,
      },
      ipAddress,
    });

    return {
      verified: true,
      mTlsReady: inspected.supportsClientAuth,
      metadata: this.toMetadata(updated),
    };
  }

  async revoke(
    principal: AuthenticatedPrincipal,
    certificateId: string,
    ipAddress?: string,
  ): Promise<CertificateMetadata> {
    const record = await this.prisma.certificate.findFirst({
      where: {
        id: certificateId,
        tenantId: principal.tenantId,
      },
    });

    if (!record) {
      throw new NotFoundException('Certificado não encontrado.');
    }

    const updated = await this.prisma.certificate.update({
      where: { id: record.id },
      data: {
        isActive: false,
        status: 'REVOKED',
      },
    });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'CERTIFICATE_REVOKED',
      resource: 'Certificate',
      resourceId: record.id,
      metadata: { companyId: record.companyId },
      ipAddress,
    });

    return this.toMetadata(updated);
  }

  /**
   * Método estritamente interno para o worker/conectores na VPS obterem
   * o certificado A1 em memória durante mTLS / assinatura XMLDSig.
   */
  async getActiveMaterialForCompany(
    tenantId: string,
    companyId: string,
  ): Promise<DecryptedCertificateMaterial> {
    const record = await this.prisma.certificate.findFirst({
      where: {
        tenantId,
        companyId,
        isActive: true,
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new NotFoundException(
        'Nenhum certificado A1 ativo disponível para esta empresa.',
      );
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        `Certificado A1 expirado em ${record.expiresAt.toISOString()}.`,
      );
    }

    return this.decryptRecord(record);
  }

  private decryptRecord(record: Certificate): DecryptedCertificateMaterial {
    const pfxBuffer = this.cryptoService.decryptBuffer(
      Buffer.from(record.encryptedPfx),
      record.pfxIv,
      record.pfxAuthTag,
    );
    const passphrase = this.cryptoService.decryptText(
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

  private computeStatus(expiresAt: Date): CertificateStatus {
    const now = Date.now();
    if (expiresAt.getTime() <= now) {
      return 'EXPIRED';
    }
    const diffDays = (expiresAt.getTime() - now) / (1000 * 60 * 60 * 24);
    if (diffDays <= EXPIRING_SOON_DAYS) {
      return 'EXPIRING_SOON';
    }
    return 'ACTIVE';
  }

  private toMetadata(record: Certificate): CertificateMetadata {
    const dynamicStatus =
      record.status === 'REVOKED' || record.status === 'INVALID'
        ? (record.status as CertificateStatus)
        : this.computeStatus(record.expiresAt);

    return {
      id: record.id,
      companyId: record.companyId,
      tenantId: record.tenantId,
      type: record.type,
      subjectName: record.subjectName,
      subjectDocument: record.subjectDocument,
      issuerName: record.issuerName,
      serialNumber: record.serialNumber,
      fingerprint: record.fingerprint,
      validFrom: record.validFrom.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      status: dynamicStatus,
      isActive: record.isActive,
      lastValidatedAt: record.lastValidatedAt?.toISOString() ?? null,
    };
  }
}

