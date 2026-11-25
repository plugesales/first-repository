import type { DecryptedCertificateMaterial } from './certificate';

export interface MtlsRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'HEAD' | 'PUT';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  certificate: Pick<DecryptedCertificateMaterial, 'pfxBuffer' | 'passphrase'>;
  ca?: string | Buffer;
  rejectUnauthorized?: boolean;
}

export interface MtlsResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface MtlsTransport {
  request(options: MtlsRequestOptions): Promise<MtlsResponse>;
}

export interface ProviderCompanyContext {
  companyId: string;
  tenantId: string;
  document: string;
  municipalReg: string;
  municipalityCode: string;
  simplesNacionalOpt: number;
  specialTaxRegime?: number;
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  dpsSeries: string;
  endpointUrl?: string;
  layoutVersion?: '1.00' | '1.01';
}

export interface ProviderRuntimeDeps {
  mtlsTransport: MtlsTransport;
  getCertificate: (companyId: string) => Promise<DecryptedCertificateMaterial>;
  getCompanyContext: (companyId: string) => Promise<ProviderCompanyContext>;
  allocateDpsNumber: (companyId: string, series: string) => Promise<bigint>;
}

