import type {
  FiscalEnvironment,
  NfseEmissionInput,
  NfseIbsCbsInput,
} from '@nfse-hub/nfse-types';

export type LayoutVersion = '1.00' | '1.01';

export const NFSE_NAMESPACE = 'http://www.sped.fazenda.gov.br/nfse';

export interface DpsBuildInput {
  environment: FiscalEnvironment;
  appVersion: string;
  dpsSeries: string;
  dpsNumber: string | number | bigint;
  issuedAtUtc: string;
  provider: {
    document: string;
    municipalReg: string;
    municipalityCode: string;
    simplesNacionalOpt: number;
    specialTaxRegime?: number;
  };
  emission: NfseEmissionInput;
  layoutVersion?: LayoutVersion;
  /** Finalidade da NFS-e em <infDPS> (exigida na NT 009 / SEFIN Nacional v1.01: 0 = regular). */
  finNFSe?: '0' | '1' | '2';
  /** Grupo IBSCBS (obrigatório na v1.01 do ISS/DF para competência >= 01/10/2026). */
  ibscbs?: NfseIbsCbsInput;
}

/**
 * Gera o TSIdDPS de 45 posições conforme Seção 8.2 do Manual v1.01:
 * "DPS" + Cód.Mun(7) + TipoInsc(1: 1=CPF,2=CNPJ) + InscFed(14) + Serie(5) + NumDPS(15)
 */
export function buildDpsId(params: {
  municipalityCode: string;
  providerDocument: string;
  series: string | number;
  number: string | number | bigint;
}): string {
  const mun = params.municipalityCode.replace(/\D/g, '').padStart(7, '0').slice(0, 7);
  const docDigits = params.providerDocument.replace(/\D/g, '');
  const docType = docDigits.length === 14 ? '2' : '1';
  const paddedDoc = docDigits.padStart(14, '0').slice(0, 14);
  const paddedSeries = String(params.series).replace(/\D/g, '').padStart(5, '0').slice(0, 5);
  const paddedNumber = String(params.number).replace(/\D/g, '').padStart(15, '0').slice(0, 15);

  return `DPS${mun}${docType}${paddedDoc}${paddedSeries}${paddedNumber}`;
}

export function buildSoapHeaderXml(layoutVersion: LayoutVersion = '1.01'): string {
  return `<cabecalho versao="${layoutVersion}" xmlns="${NFSE_NAMESPACE}"><versaoDados>${layoutVersion}</versaoDados></cabecalho>`;
}

/**
 * Formata data/hora no padrão TSDateTimeUTC exigido pelos XSDs da NFS-e:
 * AAAA-MM-DDThh:mm:ss-03:00 (sem milissegundos e sem sufixo "Z").
 */
export function formatNfseDateTime(date = new Date()): string {
  const brasiliaMs = date.getTime() - 3 * 60 * 60 * 1000;
  const br = new Date(brasiliaMs);
  const iso = br.toISOString().slice(0, 19);
  return `${iso}-03:00`;
}

/**
 * Constrói o XML da DPS sem espaços/quebras de linha entre TAGs, omitindo TAGs nulas,
 * conforme recomendações da Seção 8.1 e Seção 10.3 do Manual v1.01.
 */
export function buildDpsXml(input: DpsBuildInput): {
  dpsId: string;
  xml: string;
} {
  const version: LayoutVersion = input.layoutVersion ?? '1.01';
  const tpAmb = input.environment === 'PRODUCTION' ? '1' : '2';
  const providerDoc = input.provider.document.replace(/\D/g, '');
  const providerDocTag = providerDoc.length === 14 ? 'CNPJ' : 'CPF';

  const dpsId = buildDpsId({
    municipalityCode: input.provider.municipalityCode,
    providerDocument: providerDoc,
    series: input.dpsSeries,
    number: input.dpsNumber,
  });

  const customerDoc = input.emission.customer.document.replace(/\D/g, '');
  const customerDocTag = customerDoc.length === 14 ? 'CNPJ' : 'CPF';
  const addr = input.emission.customer.address;
  const addrZip = addr?.zipCode?.replace(/\D/g, '') ?? '';
  const addrCity = addr?.cityCode?.replace(/\D/g, '') ?? '';
  const hasCustomerAddress =
    addrCity.length === 7 &&
    addrZip.length === 8 &&
    Boolean(addr?.street?.trim()) &&
    Boolean(addr?.number?.trim()) &&
    Boolean(addr?.district?.trim());

  const servValue = formatDecimal(input.emission.service.amount);
  const descIncond = input.emission.service.unconditionalDiscount;
  const descCond = input.emission.service.conditionalDiscount;
  const tpRetISSQN = input.emission.service.issWithheld ? '2' : '1';
  const cleanNbs = input.emission.nbsCode?.replace(/\D/g, '').slice(0, 9) ?? '';
  const ibscbs = input.ibscbs ?? input.emission.ibscbs;

  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<DPS versao="${version}" xmlns="${NFSE_NAMESPACE}">`,
    `<infDPS Id="${dpsId}">`,
    `<tpAmb>${tpAmb}</tpAmb>`,
    `<dhEmi>${escapeXml(input.issuedAtUtc)}</dhEmi>`,
    `<verAplic>${escapeXml(input.appVersion.slice(0, 20))}</verAplic>`,
    `<serie>${Number(input.dpsSeries)}</serie>`,
    `<nDPS>${String(input.dpsNumber)}</nDPS>`,
    `<dCompet>${escapeXml(input.emission.competenceDate.slice(0, 10))}</dCompet>`,
    `<tpEmit>1</tpEmit>`,
    ...(input.finNFSe ? [`<finNFSe>${input.finNFSe}</finNFSe>`] : []),
    `<cLocEmi>${escapeXml(input.provider.municipalityCode)}</cLocEmi>`,
    `<prest>`,
    `<${providerDocTag}>${providerDoc}</${providerDocTag}>`,
    ...(input.provider.municipalReg
      ? [`<IM>${escapeXml(input.provider.municipalReg)}</IM>`]
      : []),
    `<regTrib>`,
    `<opSimpNac>${input.provider.simplesNacionalOpt}</opSimpNac>`,
    `<regEspTrib>${input.provider.specialTaxRegime ?? 0}</regEspTrib>`,
    `</regTrib>`,
    `</prest>`,
    `<toma>`,
    `<${customerDocTag}>${customerDoc}</${customerDocTag}>`,
    `<xNome>${escapeXml(input.emission.customer.name.trim().slice(0, 300))}</xNome>`,
    ...(hasCustomerAddress && addr
      ? [
          `<end>`,
          `<endNac>`,
          `<cMun>${escapeXml(addrCity)}</cMun>`,
          `<CEP>${escapeXml(addrZip)}</CEP>`,
          `</endNac>`,
          `<xLgr>${escapeXml(addr.street!.trim().slice(0, 255))}</xLgr>`,
          `<nro>${escapeXml(addr.number!.trim().slice(0, 60))}</nro>`,
          `<xBairro>${escapeXml(addr.district!.trim().slice(0, 60))}</xBairro>`,
          `</end>`,
        ]
      : []),
    ...(input.emission.customer.email
      ? [`<email>${escapeXml(input.emission.customer.email.trim().slice(0, 80))}</email>`]
      : []),
    `</toma>`,
    `<serv>`,
    `<locPrest><cLocPrestacao>${escapeXml(input.emission.municipalityCode)}</cLocPrestacao></locPrest>`,
    `<cServ>`,
    `<cTribNac>${escapeXml(input.emission.serviceCode.replace(/\D/g, '').slice(0, 6))}</cTribNac>`,
    ...(input.emission.municipalTaxCode
      ? [`<cTribMun>${escapeXml(input.emission.municipalTaxCode.trim().slice(0, 20))}</cTribMun>`]
      : []),
    `<xDescServ>${escapeXml(input.emission.service.description.trim().slice(0, 2000))}</xDescServ>`,
    ...(cleanNbs ? [`<cNBS>${escapeXml(cleanNbs)}</cNBS>`] : []),
    `</cServ>`,
    `</serv>`,
    `<valores>`,
    `<vServPrest><vServ>${servValue}</vServ></vServPrest>`,
    ...(descIncond || descCond
      ? [
          `<vDescCondIncond>`,
          ...(descIncond ? [`<vDescIncond>${formatDecimal(descIncond)}</vDescIncond>`] : []),
          ...(descCond ? [`<vDescCond>${formatDecimal(descCond)}</vDescCond>`] : []),
          `</vDescCondIncond>`,
        ]
      : []),
    `<trib>`,
    `<tribMun>`,
    `<tribISSQN>1</tribISSQN>`,
    `<tpRetISSQN>${tpRetISSQN}</tpRetISSQN>`,
    ...(input.provider.simplesNacionalOpt !== 1 && input.emission.service.issRate !== undefined
      ? [`<pAliq>${formatDecimal(input.emission.service.issRate)}</pAliq>`]
      : []),
    `</tribMun>`,
    ...(input.provider.simplesNacionalOpt === 1
      ? [
          `<totTrib><vTotTrib><vTotTribFed>0.00</vTotTribFed><vTotTribEst>0.00</vTotTribEst><vTotTribMun>0.00</vTotTribMun></vTotTrib></totTrib>`,
        ]
      : [`<totTrib><indTotTrib>0</indTotTrib></totTrib>`]),
    `</trib>`,
    `</valores>`,
    ...(ibscbs
      ? [
          `<IBSCBS>` +
            `<finNFSe>${escapeXml(ibscbs.finNFSe ?? '0')}</finNFSe>` +
            `<cIndOp>${escapeXml(ibscbs.cIndOp ?? '100301')}</cIndOp>` +
            `<indDest>${escapeXml(ibscbs.indDest ?? '0')}</indDest>` +
            `<valores><trib><gIBSCBS>` +
            `<CST>${escapeXml(ibscbs.cst ?? '000')}</CST>` +
            `<cClassTrib>${escapeXml(ibscbs.cClassTrib ?? '000001')}</cClassTrib>` +
            `</gIBSCBS></trib></valores>` +
            `</IBSCBS>`,
        ]
      : []),
    `</infDPS>`,
    `</DPS>`,
  ];

  return {
    dpsId,
    xml: parts.join(''),
  };
}

function formatDecimal(value: number): string {
  return value.toFixed(2);
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

