import type { PrismaClient } from '@prisma/client';
import type {
  CancelJobPayload,
  EmissionJobPayload,
  NfseEmissionProcessor,
} from '../processors/nfse-emission.processor';

/**
 * Executor local de Outbox sem dependência de Redis/BullMQ,
 * ideal para validação em máquina de teste (WORKER_MODE=direct).
 * Na VPS utiliza-se WORKER_MODE=bullmq com Redis.
 */
export class DirectOutboxRunner {
  private running = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly processor: NfseEmissionProcessor,
  ) {}

  async pollOnce(batchSize = 10): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    let processed = 0;
    try {
      const pendingEvents = await this.prisma.outboxEvent.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
      });

      for (const event of pendingEvents) {
        const claimed = await this.prisma.outboxEvent.updateMany({
          where: { id: event.id, status: 'PENDING' },
          data: {
            status: 'DISPATCHED',
            attempts: { increment: 1 },
            processedAt: new Date(),
          },
        });

        if (claimed.count === 0) continue;

        try {
          if (event.eventType === 'INVOICE_CANCEL_REQUESTED') {
            await this.processor.processCancel(
              event.payload as unknown as CancelJobPayload,
            );
          } else {
            await this.processor.process(
              event.payload as unknown as EmissionJobPayload,
            );
          }
          processed++;
        } catch (error) {
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'FAILED',
              lastError:
                error instanceof Error
                  ? error.message
                  : 'Erro ao processar evento no worker direto.',
            },
          });
        }
      }
    } finally {
      this.running = false;
    }

    return processed;
  }
}
