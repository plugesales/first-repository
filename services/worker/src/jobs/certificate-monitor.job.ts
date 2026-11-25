import type { PrismaClient } from '@prisma/client';

export interface CertificateMonitorSummary {
  checked: number;
  markedExpiringSoon: number;
  markedExpired: number;
}

/**
 * Job periódico na VPS para atualizar status de vencimento dos certificados A1
 * no PostgreSQL e sinalizar renovação para a contabilidade.
 */
export class CertificateMonitorJob {
  constructor(private readonly prisma: PrismaClient) {}

  async run(now = new Date()): Promise<CertificateMonitorSummary> {
    const thresholdSoon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiredResult = await this.prisma.certificate.updateMany({
      where: {
        status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
        expiresAt: { lte: now },
      },
      data: {
        status: 'EXPIRED',
        isActive: false,
      },
    });

    const soonResult = await this.prisma.certificate.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: {
          gt: now,
          lte: thresholdSoon,
        },
      },
      data: {
        status: 'EXPIRING_SOON',
      },
    });

    const total = await this.prisma.certificate.count({
      where: { status: { in: ['ACTIVE', 'EXPIRING_SOON'] } },
    });

    return {
      checked: total,
      markedExpiringSoon: soonResult.count,
      markedExpired: expiredResult.count,
    };
  }
}

