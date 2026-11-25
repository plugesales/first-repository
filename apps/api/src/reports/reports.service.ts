import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string, companyId?: string) {
    const invoiceWhere = {
      tenantId,
      ...(companyId ? { companyId } : {}),
    };

    const [
      companiesCount,
      certificates,
      groupedInvoices,
      authorizedTotals,
      recentInvoices,
    ] = await Promise.all([
      this.prisma.company.count({ where: { tenantId, isActive: true } }),
      this.prisma.certificate.findMany({
        where: { tenantId, ...(companyId ? { companyId } : {}) },
        select: { status: true, expiresAt: true, isActive: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: invoiceWhere,
        _count: { _all: true },
      }),
      this.prisma.invoice.aggregate({
        where: { ...invoiceWhere, status: 'AUTHORIZED' },
        _sum: { amount: true, netAmount: true },
      }),
      this.prisma.invoice.findMany({
        where: invoiceWhere,
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          company: { select: { legalName: true, document: true } },
          customer: { select: { name: true, document: true } },
        },
      }),
    ]);

    const now = Date.now();
    const soonLimit = now + 30 * 24 * 60 * 60 * 1000;

    let activeCertificates = 0;
    let expiringSoonCertificates = 0;
    let expiredCertificates = 0;

    for (const cert of certificates) {
      if (!cert.isActive || cert.status === 'REVOKED') continue;
      if (cert.expiresAt.getTime() <= now) {
        expiredCertificates++;
      } else if (cert.expiresAt.getTime() <= soonLimit) {
        expiringSoonCertificates++;
        activeCertificates++;
      } else {
        activeCertificates++;
      }
    }

    const countsByStatus: Record<string, number> = {};
    let totalInvoices = 0;
    for (const row of groupedInvoices) {
      countsByStatus[row.status] = row._count._all;
      totalInvoices += row._count._all;
    }

    return {
      companiesCount,
      certificates: {
        active: activeCertificates,
        expiringSoon: expiringSoonCertificates,
        expired: expiredCertificates,
      },
      invoices: {
        total: totalInvoices,
        byStatus: countsByStatus,
        authorizedAmount: Number(authorizedTotals._sum.amount ?? 0),
        authorizedNetAmount: Number(authorizedTotals._sum.netAmount ?? 0),
      },
      recentInvoices,
    };
  }
}

