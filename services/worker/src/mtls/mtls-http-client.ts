import { NodeMtlsTransport } from '@nfse-hub/xml-engine';

export type {
  MtlsRequestOptions,
  MtlsResponse,
} from '@nfse-hub/nfse-types';

/**
 * Alias mantido para compatibilidade do Worker com o transporte mTLS compartilhado.
 */
export class MtlsHttpClient extends NodeMtlsTransport {}
