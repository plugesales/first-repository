import { NFSE_NAMESPACE, type LayoutVersion } from './dps-xml-builder';

export interface CancelEventBuildInput {
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  appVersion: string;
  eventDateUtc: string;
  authorDocument: string;
  accessKey: string;
  reasonCode: string;
  reason: string;
  layoutVersion?: LayoutVersion;
}

/**
 * Gera <pedRegEvento> para Cancelamento de NFS-e (e101101) conforme Seção 10.4 do Manual v1.01.
 * TSIdPedRefEvt (62 chars): "PRE" + ChaveAcesso(50) + TipoEvento(6) + "001" (3 chars ou sufixo).
 */
export function buildCancelEventXml(input: CancelEventBuildInput): {
  pedRegId: string;
  xml: string;
} {
  const version: LayoutVersion = input.layoutVersion ?? '1.01';
  const tpAmb = input.environment === 'PRODUCTION' ? '1' : '2';
  const docDigits = input.authorDocument.replace(/\D/g, '');
  const docTag = docDigits.length === 14 ? 'CNPJAutor' : 'CPFAutor';
  const cleanKey = input.accessKey.replace(/\D/g, '').padStart(50, '0').slice(0, 50);
  const pedRegId = `PRE${cleanKey}101101001`;

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<pedRegEvento versao="${version}" xmlns="${NFSE_NAMESPACE}">`,
    `<infPedReg Id="${pedRegId}">`,
    `<tpAmb>${tpAmb}</tpAmb>`,
    `<verAplic>${escapeXml(input.appVersion.slice(0, 20))}</verAplic>`,
    `<dhEvento>${escapeXml(input.eventDateUtc)}</dhEvento>`,
    `<${docTag}>${docDigits}</${docTag}>`,
    `<chNFSe>${escapeXml(input.accessKey)}</chNFSe>`,
    `<e101101>`,
    `<xDesc>Cancelamento de NFS-e</xDesc>`,
    `<cMotivo>${escapeXml(input.reasonCode)}</cMotivo>`,
    `<xMotivo>${escapeXml(input.reason.trim().slice(0, 255))}</xMotivo>`,
    `</e101101>`,
    `</infPedReg>`,
    `</pedRegEvento>`,
  ].join('');

  return { pedRegId, xml };
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

