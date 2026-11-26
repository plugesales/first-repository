export type InvoiceStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'authorized'
  | 'rejected'
  | 'cancelled'
  | 'unknown';

export type FiscalEnvironment = 'HOMOLOGATION' | 'PRODUCTION';

export type ProviderCode =
  | 'NATIONAL_SEFIN'
  | 'NOTA_CONTROL_DF'
  | 'ABRASF';

export interface NfseIbsCbsInput {
  finNFSe?: string;
  cIndOp?: string;
  indDest?: string;
  cst?: string;
  cClassTrib?: string;
}

export interface NfseEmissionInput {
  companyId: string;
  customerId?: string;
  municipalityCode: string;
  serviceCode: string;
  municipalTaxCode?: string;
  nbsCode?: string;
  ibscbs?: NfseIbsCbsInput;
  competenceDate: string;
  customer: {
    document: string;
    name: string;
    email?: string;
    address?: {
      zipCode?: string;
      street?: string;
      number?: string;
      district?: string;
      cityCode?: string;
    };
  };
  service: {
    description: string;
    amount: number;
    deductions?: number;
    unconditionalDiscount?: number;
    conditionalDiscount?: number;
    issWithheld?: boolean;
    issRate?: number;
  };
  idempotencyKey: string;
}

export interface NfseProviderError {
  code: string;
  message: string;
  correction?: string;
}

export interface NfseEmissionResult {
  status: InvoiceStatus;
  provider: string;
  dpsId?: string;
  accessKey?: string;
  invoiceNumber?: string;
  xml?: string;
  pdfUrl?: string;
  protocol?: string;
  errors?: NfseProviderError[];
}

export interface NfseProvider {
  readonly providerCode: ProviderCode;

  supports(input: {
    municipalityCode: string;
    companyId: string;
  }): Promise<boolean>;

  getMunicipalParameters(input: {
    municipalityCode: string;
    companyId: string;
    serviceCode?: string;
  }): Promise<unknown>;

  issue(input: NfseEmissionInput): Promise<NfseEmissionResult>;

  consult(input: {
    accessKey?: string;
    dpsId?: string;
    protocol?: string;
    companyId: string;
  }): Promise<NfseEmissionResult>;

  cancel(input: {
    accessKey: string;
    companyId: string;
    reasonCode: string;
    reason: string;
  }): Promise<NfseEmissionResult>;
}

