import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_KEYS = new Set([
  'password',
  'passphrase',
  'pfx',
  'pfxbuffer',
  'encryptedpfx',
  'encryptedpassword',
  'privatekey',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'cert_master_key',
]);

export interface RecordAuditInput {
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput): Promise<void> {
    const sanitizedMetadata = input.metadata
      ? (this.sanitize(input.metadata) as Prisma.InputJsonValue)
      : undefined;

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId,
          metadata: sanitizedMetadata,
          ipAddress: input.ipAddress,
        },
      });
    } catch (error) {
      this.logger.error(
        `Falha ao registrar AuditLog (${input.action} ${input.resource}): ${error instanceof Error ? error.message : 'erro'}`,
      );
    }
  }

  private sanitize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }
    if (value && typeof value === 'object') {
      const clean: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
          clean[key] = '[REDACTED]';
        } else {
          clean[key] = this.sanitize(val);
        }
      }
      return clean;
    }
    return value;
  }
}

