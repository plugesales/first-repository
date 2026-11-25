import type { PrismaClient } from '@prisma/client';

/**
 * Controle transacional e concorrente da numeração sequencial de DPS
 * por empresa + série, conforme Seção 5 do Modulo Completo.
 */
export class DpsSequenceService {
  constructor(private readonly prisma: PrismaClient) {}

  async nextNumber(companyId: string, series: string): Promise<bigint> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.dpsSequence.findUnique({
        where: {
          companyId_series: { companyId, series },
        },
      });

      if (!existing) {
        const created = await tx.dpsSequence.create({
          data: {
            companyId,
            series,
            lastNumber: 1n,
          },
        });
        return created.lastNumber;
      }

      const updated = await tx.dpsSequence.update({
        where: { id: existing.id },
        data: {
          lastNumber: { increment: 1n },
        },
      });
      return updated.lastNumber;
    });
  }
}

