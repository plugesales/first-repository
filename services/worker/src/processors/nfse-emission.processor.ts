import type { ProviderRegistry } from '@nfse-hub/municipality-registry';
import type {
  DecryptedCertificateMaterial,
  InvoiceStatus,
  NfseEmissionInput,
  NfseEmissionResult,
  ProviderCode,
} from '@nfse-hub/nfse-types';

export interface EmissionJobPayload {
  tenantId: string;
  invoiceId: string;
}

export interface CancelJobPayload {
  tenantId: string;
  invoiceId: string;
  eventId: string;
  reasonCode: string;
  reason: string;
}

export interface InvoiceJobRecord {
  id: string;
  tenantId: string;
  companyId: string;
  providerCode: ProviderCode;
  status: string;
  dpsSeries: string | null;
  dpsNumber: bigint | null;
  accessKey: string | null;
  payload: unknown;
  dps: {
    id: string;
    dpsKey: string;
  } | null;
}

export interface WorkerEmissionStore {
  getInvoiceForProcessing(
    tenantId: string,
    invoiceId: string,
  ): Promise<InvoiceJobRecord | null>;
  markProcessing(invoiceId: string): Promise<void>;
  saveResult(params: {
    invoiceId: string;
    status: InvoiceStatus;
    accessKey?: string;
    invoiceNumber?: string;
    authorizedXml?: string;
    lastErrorCode?: string;
    lastErrorMsg?: string;
  }): Promise<void>;
  recordTransmission(params: {
    tenantId: string;
    companyId: string;
    invoiceId: string;
    providerCode: ProviderCode;
    operation: string;
    endpoint: string;
    protocol?: string;
    responseSummary?: string;
  }): Promise<void>;
  saveCancelResult?(params: {
    invoiceId: string;
    eventId: string;
    status: 'CANCELLED' | 'REJECTED';
    protocol?: string;
    responseXml?: string;
  }): Promise<void>;
}

export interface CertificateMaterialProvider {
  getActiveMaterial(
    tenantId: string,
    companyId: string,
  ): Promise<DecryptedCertificateMaterial>;
}

/**
 * Processador de emissão com idempotência estrita:
 * 1) Não reemite notas já AUTHORIZED ou CANCELLED.
 * 2) Se status anterior for UNKNOWN ou já existir DPS/chave vinculada,
 *    consulta primeiro no autorizador (timeout não significa rejeição).
 */
export class NfseEmissionProcessor {
  constructor(
    private readonly store: WorkerEmissionStore,
    private readonly certificateVault: CertificateMaterialProvider,
    private readonly providerRegistry: ProviderRegistry,
  ) {}

  async process(job: EmissionJobPayload): Promise<NfseEmissionResult> {
    const invoice = await this.store.getInvoiceForProcessing(
      job.tenantId,
      job.invoiceId,
    );

    if (!invoice) {
      throw new Error(
        `Invoice ${job.invoiceId} não encontrada para o tenant ${job.tenantId}.`,
      );
    }

    if (invoice.status === 'AUTHORIZED' || invoice.status === 'CANCELLED') {
      return {
        status: invoice.status.toLowerCase() as InvoiceStatus,
        provider: invoice.providerCode,
        accessKey: invoice.accessKey ?? undefined,
      };
    }

    // Garante que existe certificado A1 válido antes de qualquer chamada fiscal
    const certificate = await this.certificateVault.getActiveMaterial(
      job.tenantId,
      invoice.companyId,
    );

    const provider = this.providerRegistry.getByCode(invoice.providerCode);
    if (!provider) {
      throw new Error(
        `Conector ${invoice.providerCode} não registrado no Worker.`,
      );
    }

    await this.store.markProcessing(invoice.id);

    const emissionInput = invoice.payload as NfseEmissionInput;
    let result: NfseEmissionResult;

    try {
      // Regra fiscal obrigatória: se o estado anterior ficou UNKNOWN ou já há DPS,
      // consultar antes de repetir transmissão.
      if (
        invoice.status === 'UNKNOWN' ||
        invoice.dps?.dpsKey ||
        invoice.accessKey
      ) {
        result = await provider.consult({
          accessKey: invoice.accessKey ?? undefined,
          dpsId: invoice.dps?.dpsKey,
          companyId: invoice.companyId,
        });
      } else {
        result = await provider.issue({
          ...emissionInput,
          companyId: invoice.companyId,
        });
      }
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : 'Erro desconhecido na transmissão';

      await this.store.saveResult({
        invoiceId: invoice.id,
        status: 'unknown',
        lastErrorMsg: errMsg,
      });

      await this.store.recordTransmission({
        tenantId: invoice.tenantId,
        companyId: invoice.companyId,
        invoiceId: invoice.id,
        providerCode: invoice.providerCode,
        operation: invoice.status === 'UNKNOWN' ? 'CONSULT' : 'ISSUE',
        endpoint: invoice.providerCode,
        responseSummary: `FAILED:${certificate.subjectDocument}:${errMsg}`,
      });

      throw error;
    }

    const firstError = result.errors?.[0];
    const combinedErrors =
      result.errors && result.errors.length > 0
        ? result.errors
            .map((e) => `[${e.code}] ${e.message}`)
            .join(' | ')
            .slice(0, 1000)
        : undefined;

    await this.store.saveResult({
      invoiceId: invoice.id,
      status: result.status,
      accessKey: result.accessKey,
      invoiceNumber: result.invoiceNumber,
      authorizedXml: result.xml,
      lastErrorCode: firstError?.code,
      lastErrorMsg: combinedErrors,
    });

    await this.store.recordTransmission({
      tenantId: invoice.tenantId,
      companyId: invoice.companyId,
      invoiceId: invoice.id,
      providerCode: invoice.providerCode,
      operation: invoice.status === 'UNKNOWN' ? 'CONSULT' : 'ISSUE',
      endpoint: invoice.providerCode,
      protocol: result.protocol,
      responseSummary: `STATUS:${result.status}`,
    });

    return result;
  }

  async processCancel(job: CancelJobPayload): Promise<NfseEmissionResult> {
    const invoice = await this.store.getInvoiceForProcessing(
      job.tenantId,
      job.invoiceId,
    );

    if (!invoice || !invoice.accessKey) {
      throw new Error(
        `Nota ${job.invoiceId} sem chave de acesso para cancelamento.`,
      );
    }

    if (invoice.status === 'CANCELLED') {
      return {
        status: 'cancelled',
        provider: invoice.providerCode,
        accessKey: invoice.accessKey,
      };
    }

    await this.certificateVault.getActiveMaterial(
      job.tenantId,
      invoice.companyId,
    );

    const provider = this.providerRegistry.getByCode(invoice.providerCode);
    if (!provider) {
      throw new Error(
        `Conector ${invoice.providerCode} não registrado no Worker.`,
      );
    }

    const result = await provider.cancel({
      accessKey: invoice.accessKey,
      companyId: invoice.companyId,
      reasonCode: job.reasonCode,
      reason: job.reason,
    });

    await this.store.saveCancelResult?.({
      invoiceId: invoice.id,
      eventId: job.eventId,
      status: result.status === 'cancelled' ? 'CANCELLED' : 'REJECTED',
      protocol: result.protocol,
      responseXml: result.xml,
    });

    await this.store.recordTransmission({
      tenantId: invoice.tenantId,
      companyId: invoice.companyId,
      invoiceId: invoice.id,
      providerCode: invoice.providerCode,
      operation: 'CANCEL',
      endpoint: invoice.providerCode,
      protocol: result.protocol,
      responseSummary: `STATUS:${result.status}`,
    });

    return result;
  }
}

