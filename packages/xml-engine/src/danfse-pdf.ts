import { XMLParser } from 'fast-xml-parser';
import PDFDocument from 'pdfkit';

export interface DanfseFallbackMetadata {
  invoiceNumber?: string | null;
  accessKey?: string | null;
  companyName?: string;
  companyDocument?: string;
  municipalityName?: string;
  customerName?: string;
  customerDocument?: string;
  serviceDescription?: string;
  amount?: string | number;
  netAmount?: string | number | null;
  competenceDate?: string;
}

/**
 * Gera representação auxiliar em PDF (DANFSe) a partir do XML autorizado da NFS-e,
 * com fallback seguro para metadados persistidos caso algum campo esteja ausente.
 */
export async function generateDanfsePdf(params: {
  authorizedXml: string;
  fallback?: DanfseFallbackMetadata;
}): Promise<Buffer> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    attributeNamePrefix: '@_',
    parseTagValue: false,
  });

  const parsed = parser.parse(params.authorizedXml) as Record<string, unknown>;
  const nfse = findFirstObject(parsed, 'InfNfse') ?? {};
  const emit = (nfse.emit as Record<string, unknown> | undefined) ?? {};
  const valores = (nfse.valores as Record<string, unknown> | undefined) ?? {};
  const dps = (nfse.DPS as Record<string, unknown> | undefined) ?? {};
  const infDps = (dps.infDPS as Record<string, unknown> | undefined) ?? {};
  const toma = (infDps.toma as Record<string, unknown> | undefined) ?? {};
  const serv = (infDps.serv as Record<string, unknown> | undefined) ?? {};
  const cServ = (serv.cServ as Record<string, unknown> | undefined) ?? {};
  const dpsValores = (infDps.valores as Record<string, unknown> | undefined) ?? {};
  const vServPrest =
    (dpsValores.vServPrest as Record<string, unknown> | undefined) ?? {};

  const invoiceNumber =
    str(nfse.nNFSe) ?? params.fallback?.invoiceNumber ?? '-';
  const accessKey =
    (typeof nfse['@_Id'] === 'string'
      ? nfse['@_Id'].replace(/^NFS/, '')
      : undefined) ??
    params.fallback?.accessKey ??
    '-';
  const issuedAt = str(nfse.dhProc) ?? str(infDps.dhEmi) ?? '-';
  const competence =
    str(infDps.dCompet) ?? params.fallback?.competenceDate ?? '-';

  const providerName =
    str(emit.xNome) ?? params.fallback?.companyName ?? 'Prestador';
  const providerDoc =
    str(emit.CNPJ) ?? str(emit.CPF) ?? params.fallback?.companyDocument ?? '-';
  const providerIm = str(emit.IM) ?? '-';
  const locEmi = str(nfse.xLocEmi) ?? params.fallback?.municipalityName ?? '-';

  const customerName =
    str(toma.xNome) ?? params.fallback?.customerName ?? 'Não informado';
  const customerDoc =
    str(toma.CNPJ) ?? str(toma.CPF) ?? params.fallback?.customerDocument ?? '-';

  const serviceDesc =
    str(cServ.xDescServ) ??
    params.fallback?.serviceDescription ??
    'Prestação de serviços';
  const serviceCode = str(cServ.cTribNac) ?? '-';
  const serviceValue =
    str(vServPrest.vServ) ??
    (params.fallback?.amount !== undefined
      ? String(params.fallback.amount)
      : '0.00');
  const issRate = str(valores.pAliqAplic) ?? '-';
  const issValue = str(valores.vISSQN) ?? '0.00';
  const netValue =
    str(valores.vLiq) ??
    (params.fallback?.netAmount !== undefined &&
    params.fallback?.netAmount !== null
      ? String(params.fallback.netAmount)
      : serviceValue);

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cabeçalho
    doc
      .rect(40, 40, 515, 58)
      .fillColor('#181A1F')
      .fill();

    doc
      .fillColor('#F76415')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('DANFSe — Documento Auxiliar da NFS-e', 54, 52);

    doc
      .fillColor('#E4E4E7')
      .fontSize(9)
      .font('Helvetica')
      .text(`Município Emissor: ${locEmi}`, 54, 72)
      .text(`NFS-e Nº: ${invoiceNumber}`, 400, 54, { align: 'right', width: 140 })
      .text(`Emissão: ${issuedAt}`, 350, 70, { align: 'right', width: 190 });

    doc.moveDown(2.2);
    doc.fillColor('#111827');

    // Chave de acesso
    doc.fontSize(9).font('Helvetica-Bold').text('CHAVE DE ACESSO');
    doc
      .font('Courier')
      .fontSize(9)
      .text(accessKey)
      .moveDown(0.8);

    drawDivider(doc);

    // Prestador
    doc.font('Helvetica-Bold').fontSize(10).text('PRESTADOR DE SERVIÇOS');
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Razão Social: ${providerName}`)
      .text(`CPF/CNPJ: ${providerDoc}    |    Inscrição Municipal: ${providerIm}`)
      .moveDown(0.8);

    drawDivider(doc);

    // Tomador
    doc.font('Helvetica-Bold').fontSize(10).text('TOMADOR DE SERVIÇOS');
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Nome/Razão Social: ${customerName}`)
      .text(`CPF/CNPJ: ${customerDoc}    |    Competência: ${competence}`)
      .moveDown(0.8);

    drawDivider(doc);

    // Discriminação
    doc.font('Helvetica-Bold').fontSize(10).text('DISCRIMINAÇÃO DOS SERVIÇOS');
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Código Tributação Nacional: ${serviceCode}`)
      .moveDown(0.3)
      .text(serviceDesc, { width: 515 })
      .moveDown(1);

    drawDivider(doc);

    // Valores
    doc.font('Helvetica-Bold').fontSize(10).text('VALORES E TRIBUTAÇÃO');
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(`Valor dos Serviços: R$ ${serviceValue}`)
      .text(`Alíquota ISSQN: ${issRate}%    |    Valor ISSQN: R$ ${issValue}`)
      .font('Helvetica-Bold')
      .text(`Valor Líquido: R$ ${netValue}`)
      .moveDown(1.5);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#6B7280')
      .text(
        'Documento auxiliar gerado pelo NFS-e Hub a partir do XML oficial autorizado. A validade fiscal reside integralmente no XML assinado.',
        { align: 'center' },
      );

    doc.end();
  });
}

function findFirstObject(
  node: unknown,
  targetKey: string,
): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if (record[targetKey] && typeof record[targetKey] === 'object') {
    return record[targetKey] as Record<string, unknown>;
  }
  for (const val of Object.values(record)) {
    const found = findFirstObject(val, targetKey);
    if (found) return found;
  }
  return null;
}

function str(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function drawDivider(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc
    .moveTo(40, y)
    .lineTo(555, y)
    .strokeColor('#D4D4D8')
    .lineWidth(0.75)
    .stroke();
  doc.moveDown(0.6);
}

