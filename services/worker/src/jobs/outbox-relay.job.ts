import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';

/**
 * Relay do padrão Transactional Outbox: garante que nenhuma operação
 * gravada no PostgreSQL se perca antes de chegar à fila BullMQ no Redis.
 */
export class OutboxRelayJob {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emissionQueue: Queue,
  ) {}

  async dispatchPending(batchSize = 25): Promise<number> {
    const events = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    let dispatched = 0;

    for (const event of events) {
      try {
        await this.emissionQueue.add(event.eventType, event.payload, {
          jobId: `${event.aggregate}-${event.aggregateId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 500,
          removeOnFail: 1000,
        });

        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'DISPATCHED',
            processedAt: new Date(),
          },
        });
        dispatched++;
      } catch (error) {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts: { increment: 1 },
            lastError:
              error instanceof Error ? error.message : 'Erro ao enfileirar',
          },
        });
      }
    }

    return dispatched;
  }
}

