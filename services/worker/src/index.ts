import { ProviderRegistry } from '@nfse-hub/municipality-registry';
import { NationalSefinProvider } from '@nfse-hub/national-sefin';
import type {
  InvoiceStatus,
  ProviderCode,
  ProviderRuntimeDeps,
} from '@nfse-hub/nfse-types';
import { NotaControlDfProvider } from '@nfse-hub/nota-control-df';
import { NodeMtlsTransport } from '@nfse-hub/xml-engine';
import { Prisma, PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { loadWorkerEnv } from './config/worker-env';
import { CertificateMonitorJob } from './jobs/certificate-monitor.job';
import { DirectOutboxRunner } from './jobs/direct-outbox-runner';
import { OutboxRelayJob } from './jobs/outbox-relay.job';
import {
  NfseEmissionProcessor,
  type CancelJobPayload,
  type EmissionJobPayload,
  type WorkerEmissionStore,
} from './processors/nfse-emission.processor';
import { DpsSequenceService } from './sequence/dps-sequence.service';
import { WorkerCertificateVault } from './vault/worker-certificate-vault';

export const NFSE_EMISSION_QUEUE = 'nfse-emission';

export async function bootstrapWorker(): Promise<void> {
  const env = loadWorkerEnv();
  const prisma = new PrismaClient();

  const vault = new WorkerCertificateVault(
    {
      findActiveByCompany: (tenantId, companyId) =>
        prisma.certificate.findFirst({
          where: {
            tenantId,
            companyId,
            isActive: true,
            status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
          },
          orderBy: { createdAt: 'desc' },
        }),
    },
    {
      nodeEnv: env.NODE_ENV,
      certMasterKey: env.CERT_MASTER_KEY,
    },
  );

  const sequenceService = new DpsSequenceService(prisma);
  const mtlsTransport = new NodeMtlsTransport();

  const runtimeDeps: ProviderRuntimeDeps = {
    mtlsTransport,
    getCertificate: async (companyId) => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { tenantId: true },
      });
      if (!company) {
        throw new Error(`Empresa ${companyId} não encontrada.`);
      }
      return vault.getActiveMaterial(company.tenantId, companyId);
    },
    getCompanyContext: async (companyId) => {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) {
        throw new Error(`Empresa ${companyId} não encontrada.`);
      }
      const municipality = await prisma.municipality.findUnique({
        where: { ibgeCode: company.municipalityCode },
      });

      const endpointUrl =
        company.environment === 'PRODUCTION'
          ? municipality?.productionUrl ?? undefined
          : municipality?.homologationUrl ?? undefined;

      return {
        companyId: company.id,
        tenantId: company.tenantId,
        document: company.document,
        municipalReg: company.municipalReg ?? '',
        municipalityCode: company.municipalityCode,
        simplesNacionalOpt: company.simplesNacionalOpt ?? 1,
        environment: company.environment,
        dpsSeries: company.defaultDpsSeries,
        endpointUrl,
        layoutVersion:
          municipality?.layoutVersion === '1.00' ? '1.00' : '1.01',
      };
    },
    allocateDpsNumber: (companyId, series) =>
      sequenceService.nextNumber(companyId, series),
  };

  const registry = new ProviderRegistry();
  registry.register(
    new NationalSefinProvider({
      deps: runtimeDeps,
      supportsCheck: async (ibgeCode) => {
        const mun = await prisma.municipality.findUnique({
          where: { ibgeCode },
          select: { providerCode: true, active: true },
        });
        return Boolean(mun?.active && mun.providerCode === 'NATIONAL_SEFIN');
      },
    }),
  );
  registry.register(
    new NotaControlDfProvider({
      deps: runtimeDeps,
      supportsCheck: async (ibgeCode) => {
        const mun = await prisma.municipality.findUnique({
          where: { ibgeCode },
          select: { providerCode: true, active: true },
        });
        return Boolean(mun?.active && mun.providerCode === 'NOTA_CONTROL_DF');
      },
    }),
  );

  const store: WorkerEmissionStore = {
    getInvoiceForProcessing: async (tenantId, invoiceId) => {
      const inv = await prisma.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: { dps: { select: { id: true, dpsKey: true } } },
      });
      if (!inv) return null;
      return {
        ...inv,
        providerCode: inv.providerCode as ProviderCode,
      };
    },
    markProcessing: async (invoiceId) => {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'PROCESSING' },
      });
    },
    saveResult: async (params) => {
      await prisma.invoice.update({
        where: { id: params.invoiceId },
        data: {
          status: params.status.toUpperCase() as Prisma.InvoiceUpdateInput['status'],
          accessKey: params.accessKey,
          invoiceNumber: params.invoiceNumber,
          authorizedXml: params.authorizedXml,
          lastErrorCode: params.lastErrorCode,
          lastErrorMsg: params.lastErrorMsg,
        },
      });

      const webhookUrl =
        process.env.N8N_WEBHOOK_URL || process.env.WEBHOOK_NOTIFICATION_URL;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event:
                params.status.toUpperCase() === 'AUTHORIZED'
                  ? 'INVOICE_AUTHORIZED'
                  : 'INVOICE_REJECTED',
              invoiceId: params.invoiceId,
              status: params.status.toUpperCase(),
              invoiceNumber: params.invoiceNumber,
              accessKey: params.accessKey,
              lastErrorMsg: params.lastErrorMsg,
              lastErrorCode: params.lastErrorCode,
              pdfUrl: `/api/v1/invoices/${params.invoiceId}/pdf`,
              xmlUrl: `/api/v1/invoices/${params.invoiceId}/xml`,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (webhookErr) {
          console.warn(
            `[Webhook] Falha ao notificar n8n em ${webhookUrl}:`,
            webhookErr,
          );
        }
      }
    },
    recordTransmission: async (params) => {
      await prisma.transmission.create({
        data: {
          tenantId: params.tenantId,
          companyId: params.companyId,
          invoiceId: params.invoiceId,
          providerCode: params.providerCode,
          operation: params.operation,
          endpoint: params.endpoint,
          protocol: params.protocol,
          responseSummary: params.responseSummary,
        },
      });
    },
    saveCancelResult: async (params) => {
      await prisma.$transaction(async (tx) => {
        await tx.invoiceEvent.update({
          where: { id: params.eventId },
          data: {
            status: params.status,
            protocol: params.protocol,
            responseXml: params.responseXml,
          },
        });
        if (params.status === 'CANCELLED') {
          await tx.invoice.update({
            where: { id: params.invoiceId },
            data: { status: 'CANCELLED' },
          });
        }
      });
    },
  };

  const processor = new NfseEmissionProcessor(store, vault, registry);
  const certMonitor = new CertificateMonitorJob(prisma);

  if (env.WORKER_MODE === 'direct') {
    const directRunner = new DirectOutboxRunner(prisma, processor);
    const directTimer = setInterval(() => {
      void directRunner.pollOnce().catch((err) => {
        console.error('[nfse-hub/worker] Erro no DirectOutboxRunner:', err);
      });
    }, env.OUTBOX_POLL_INTERVAL_MS);

    const monitorTimer = setInterval(() => {
      void certMonitor.run().catch((err) => {
        console.error('[nfse-hub/worker] Erro no CertificateMonitor:', err);
      });
    }, env.CERT_MONITOR_INTERVAL_MS);

    void directRunner.pollOnce().catch((err) => {
      console.error('[nfse-hub/worker] Erro no DirectOutboxRunner inicial:', err);
    });

    console.info(
      `[nfse-hub/worker] Online em "${env.APP_ENV}" (modo direct, sem Redis) com conectores NATIONAL_SEFIN e NOTA_CONTROL_DF ativos.`,
    );

    const shutdownDirect = async () => {
      clearInterval(directTimer);
      clearInterval(monitorTimer);
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdownDirect());
    process.on('SIGTERM', () => void shutdownDirect());
    return;
  }

  const redis = new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });

  const emissionQueue = new Queue(NFSE_EMISSION_QUEUE, { connection: redis });
  const outboxRelay = new OutboxRelayJob(prisma, emissionQueue);

  const worker = new Worker<EmissionJobPayload | CancelJobPayload>(
    NFSE_EMISSION_QUEUE,
    async (job) => {
      if (job.name === 'INVOICE_CANCEL_REQUESTED') {
        return processor.processCancel(job.data as CancelJobPayload);
      }
      return processor.process(job.data as EmissionJobPayload);
    },
    { connection: redis, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[nfse-hub/worker] Job ${job?.id ?? 'unknown'} falhou: ${err.message}`,
    );
  });

  const outboxTimer = setInterval(() => {
    void outboxRelay.dispatchPending().catch((err) => {
      console.error('[nfse-hub/worker] Erro no OutboxRelay:', err);
    });
  }, env.OUTBOX_POLL_INTERVAL_MS);

  const monitorTimer = setInterval(() => {
    void certMonitor.run().catch((err) => {
      console.error('[nfse-hub/worker] Erro no CertificateMonitor:', err);
    });
  }, env.CERT_MONITOR_INTERVAL_MS);

  console.info(
    `[nfse-hub/worker] Online em "${env.APP_ENV}" com conectores NATIONAL_SEFIN e NOTA_CONTROL_DF ativos.`,
  );

  const shutdown = async () => {
    clearInterval(outboxTimer);
    clearInterval(monitorTimer);
    await worker.close();
    await emissionQueue.close();
    await redis.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

if (require.main === module) {
  void bootstrapWorker();
}

export * from './config/worker-env';
export * from './jobs/certificate-monitor.job';
export * from './jobs/outbox-relay.job';
export * from './mtls/mtls-http-client';
export * from './processors/nfse-emission.processor';
export * from './sequence/dps-sequence.service';
export * from './vault/worker-certificate-vault';
export type { InvoiceStatus };
