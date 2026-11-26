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
 * Gera representação auxiliar em PDF (DANFSe v2.0) a partir do XML autorizado da NFS-e,
 * compatível com o Padrão Nacional (<infNFSe>) e ABRASF (<InfNfse>), com fallback seguro.
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
  const nfse =
    findFirstObject(parsed, 'infNFSe') ??
    findFirstObject(parsed, 'InfNfse') ??
    {};

  const emit = obj(nfse.emit);
  const emitEnd = obj(emit.enderNac);
  const valores = obj(nfse.valores);
  const nfseIbsCbs = obj(nfse.IBSCBS);
  const nfseIbsVal = obj(nfseIbsCbs.valores);
  const nfseIbsUf = obj(nfseIbsVal.uf);
  const nfseIbsMun = obj(nfseIbsVal.mun);
  const nfseIbsFed = obj(nfseIbsVal.fed);
  const nfseIbsTot = obj(nfseIbsCbs.totCIBS);
  const nfseIbsTotIbs = obj(nfseIbsTot.gIBS);
  const nfseIbsTotCbs = obj(nfseIbsTot.gCBS);

  const dps = obj(nfse.DPS);
  const infDps = obj(dps.infDPS);
  const prest = obj(infDps.prest);
  const regTrib = obj(prest.regTrib);
  const toma = obj(infDps.toma);
  const tomaEnd = obj(toma.end);
  const tomaEndNac = obj(tomaEnd.endNac);
  const serv = obj(infDps.serv);
  const locPrest = obj(serv.locPrest);
  const cServ = obj(serv.cServ);
  const dpsValores = obj(infDps.valores);
  const vServPrest = obj(dpsValores.vServPrest);
  const vDesc = obj(dpsValores.vDescCondIncond);
  const trib = obj(dpsValores.trib);
  const tribMun = obj(trib.tribMun);
  const dpsIbsCbs = obj(infDps.IBSCBS);
  const dpsIbsTrib = obj(obj(obj(dpsIbsCbs.valores).trib).gIBSCBS);

  const invoiceNumber =
    str(nfse.nNFSe) ?? params.fallback?.invoiceNumber ?? '-';
  const accessKey =
    (typeof nfse['@_Id'] === 'string'
      ? nfse['@_Id'].replace(/^NFS/, '')
      : undefined) ??
    params.fallback?.accessKey ??
    '-';

  const locEmi = str(nfse.xLocEmi) ?? params.fallback?.municipalityName ?? '-';
  const cLocIncid = str(nfse.cLocIncid) ?? str(infDps.cLocEmi) ?? '-';
  const xLocIncid = str(nfse.xLocIncid) ?? locEmi;
  const ambGer = str(nfse.ambGer) ?? '1';
  const tpAmb = str(infDps.tpAmb) ?? '1';

  const competenceRaw = str(infDps.dCompet) ?? params.fallback?.competenceDate ?? '-';
  const competence = formatDateBr(competenceRaw);
  const dhProc = formatDateTimeBr(str(nfse.dhProc) ?? '-');
  const dhEmi = formatDateTimeBr(str(infDps.dhEmi) ?? '-');
  const dpsNumber = str(infDps.nDPS) ?? '-';
  const dpsSeries = str(infDps.serie) ?? '-';
  const finNfse = str(dpsIbsCbs.finNFSe) === '0' || !dpsIbsCbs.finNFSe ? 'NFS-e regular' : `Finalidade ${str(dpsIbsCbs.finNFSe)}`;

  const providerName =
    str(emit.xNome) ?? params.fallback?.companyName ?? 'Prestador';
  const providerDoc = formatDoc(
    str(emit.CNPJ) ?? str(emit.CPF) ?? str(prest.CNPJ) ?? str(prest.CPF) ?? params.fallback?.companyDocument ?? '-',
  );
  const providerIm = str(emit.IM) ?? str(prest.IM) ?? '-';
  const providerPhone = str(emit.fone) ?? '-';
  const providerEmail = str(emit.email) ?? '-';
  const providerAddr = [str(emitEnd.xLgr), str(emitEnd.nro), str(emitEnd.xBairro)]
    .filter(Boolean)
    .join(', ') || '-';
  const providerMunUf = `${locEmi} / ${str(emitEnd.UF) ?? 'DF'}`;
  const providerIbgeCep = `${str(emitEnd.cMun) ?? cLocIncid} / ${formatCep(str(emitEnd.CEP))}`;
  const opSimpNac = str(regTrib.opSimpNac);
  const simplesText = opSimpNac === '1' ? 'Não Optante' : opSimpNac === '2' ? 'Optante MEI' : opSimpNac === '3' ? 'Optante ME/EPP' : '-';

  const customerName =
    str(toma.xNome) ?? params.fallback?.customerName ?? 'Não informado';
  const customerDoc = formatDoc(
    str(toma.CNPJ) ?? str(toma.CPF) ?? params.fallback?.customerDocument ?? '-',
  );
  const customerIm = str(toma.IM) ?? '-';
  const customerPhone = str(toma.fone) ?? '-';
  const customerEmail = str(toma.email) ?? '-';
  const customerAddr = [str(tomaEnd.xLgr), str(tomaEnd.nro), str(tomaEnd.xBairro)]
    .filter(Boolean)
    .join(', ') || '-';
  const customerIbge = str(tomaEndNac.cMun) ?? str(nfseIbsCbs.cLocalidadeIncid) ?? '-';
  const customerMunName = str(nfseIbsCbs.xLocalidadeIncid) ?? '-';
  const customerCep = formatCep(str(tomaEndNac.CEP));

  const cTribNac = formatTribCode(str(cServ.cTribNac));
  const cTribMun = str(cServ.cTribMun) ?? '-';
  const xTribNac = str(nfse.xTribNac) ?? '';
  const xNbs = str(nfse.xNBS) ?? str(cServ.cNBS) ?? '-';
  const cNbs = formatNbs(str(cServ.cNBS));
  const xLocPrest = str(nfse.xLocPrestacao) ?? locEmi;
  const serviceDesc =
    str(cServ.xDescServ) ??
    params.fallback?.serviceDescription ??
    'Prestação de serviços';

  const serviceValue =
    str(vServPrest.vServ) ??
    (params.fallback?.amount !== undefined ? String(params.fallback.amount) : '0.00');
  const vBc = str(valores.vBC) ?? serviceValue;
  const issRate = str(valores.pAliqAplic) ?? '-';
  const issValue = str(valores.vISSQN) ?? '0.00';
  const netValue =
    str(valores.vLiq) ??
    (params.fallback?.netAmount !== undefined && params.fallback?.netAmount !== null
      ? String(params.fallback.netAmount)
      : serviceValue);
  const retText = str(tribMun.tpRetISSQN) === '2' ? 'Retido' : 'Não Retido';
  const descIncond = str(vDesc.vDescIncond) ?? '-';
  const descCond = str(vDesc.vDescCond) ?? '-';

  const cstClass = dpsIbsTrib.CST
    ? `${str(dpsIbsTrib.CST)} / ${str(dpsIbsTrib.cClassTrib) ?? '-'}`
    : '-';
  const cIndOp = str(dpsIbsCbs.cIndOp) ?? '-';
  const ibsBc = str(nfseIbsVal.vBC) ?? '-';
  const pIbsUf = str(nfseIbsUf.pIBSUF) ?? '0.00';
  const pIbsMun = str(nfseIbsMun.pIBSMun) ?? '0.00';
  const pCbs = str(nfseIbsFed.pCBS) ?? '0.00';
  const vIbsTot = str(nfseIbsTotIbs.vIBSTot) ?? '0.00';
  const vCbsTot = str(nfseIbsTotCbs.vCBS) ?? '0.00';
  const vTotalIbsCbs = (Number(vIbsTot || 0) + Number(vCbsTot || 0)).toFixed(2);
  const xOutInf = str(nfse.xOutInf) ?? '-';

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 24 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 24;
    const W = 547;
    let y = 24;

    // Cabeçalho DANFSe v2.0
    doc.rect(L, y, W, 38).strokeColor('#111827').lineWidth(0.75).stroke();
    doc.fillColor('#15803D').font('Helvetica-Bold').fontSize(16).text('NFSe', L + 8, y + 8);
    doc.fillColor('#111827').font('Helvetica').fontSize(7).text('Nota Fiscal de\nServiço Eletrônica', L + 54, y + 10);

    doc.font('Helvetica-Bold').fontSize(10).text('DANFSe v2.0', L + 165, y + 7, { width: 210, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(8.5).text('Documento Auxiliar da NFS-e', L + 165, y + 20, { width: 210, align: 'center' });

    doc.font('Helvetica').fontSize(7).text(`Município: ${locEmi}`, L + 390, y + 6, { width: 150, align: 'right' });
    doc.text(`Ambiente Gerador: ${ambGer}`, L + 390, y + 16, { width: 150, align: 'right' });
    doc.text(`Tipo de Ambiente: ${tpAmb}`, L + 390, y + 26, { width: 150, align: 'right' });
    y += 40;

    // Chave de acesso + Identificação
    doc.rect(L, y, W, 86).stroke();
    cell(doc, L + 6, y + 4, 'CHAVE DE ACESSO DA NFS-e', accessKey, 360, true);
    cell(doc, L + 6, y + 28, 'NÚMERO DA NFS-e', invoiceNumber, 115);
    cell(doc, L + 128, y + 28, 'COMPETÊNCIA DA NFS-e', competence, 115);
    cell(doc, L + 250, y + 28, 'DATA E HORA DA EMISSÃO DA NFS-e', dhProc, 150);

    cell(doc, L + 6, y + 48, 'NÚMERO DA DPS', dpsNumber, 115);
    cell(doc, L + 128, y + 48, 'SÉRIE DA DPS', dpsSeries, 115);
    cell(doc, L + 250, y + 48, 'DATA E HORA DA EMISSÃO DA DPS', dhEmi, 150);

    cell(doc, L + 6, y + 67, 'EMITENTE DA NFS-e', 'Prestador', 115);
    cell(doc, L + 128, y + 67, 'SITUAÇÃO DA NFS-e', 'NFS-e gerada', 115);
    cell(doc, L + 250, y + 67, 'FINALIDADE', finNfse, 150);

    doc.font('Helvetica').fontSize(6.5).fillColor('#374151').text(
      'A autenticidade desta NFS-e pode ser verificada pela consulta da chave de acesso no portal nacional da NFS-e.',
      L + 410,
      y + 24,
      { width: 130, align: 'left' },
    );
    doc.fillColor('#111827');
    y += 88;

    // Prestador
    doc.rect(L, y, W, 76).stroke();
    cell(doc, L + 6, y + 4, 'PRESTADOR / FORNECEDOR', providerName, 210, true);
    cell(doc, L + 220, y + 4, 'CNPJ / CPF / NIF', providerDoc, 115);
    cell(doc, L + 340, y + 4, 'Inscrição Municipal', providerIm, 100);
    cell(doc, L + 445, y + 4, 'Telefone', providerPhone, 96);

    cell(doc, L + 6, y + 30, 'Endereço', providerAddr, 210);
    cell(doc, L + 220, y + 30, 'Município / UF', providerMunUf, 115);
    cell(doc, L + 340, y + 30, 'Código IBGE / CEP', providerIbgeCep, 100);
    cell(doc, L + 445, y + 30, 'E-mail', providerEmail, 96);

    cell(doc, L + 6, y + 55, 'Simples Nacional na Data de Competência', simplesText, 210);
    cell(doc, L + 220, y + 55, 'Regime Especial de Tributação', str(regTrib.regEspTrib) === '0' ? 'Nenhum' : str(regTrib.regEspTrib) ?? '-', 210);
    y += 78;

    // Tomador
    doc.rect(L, y, W, 56).stroke();
    cell(doc, L + 6, y + 4, 'TOMADOR / ADQUIRENTE', customerName, 210, true);
    cell(doc, L + 220, y + 4, 'CNPJ / CPF / NIF', customerDoc, 115);
    cell(doc, L + 340, y + 4, 'Inscrição Municipal', customerIm, 100);
    cell(doc, L + 445, y + 4, 'Telefone', customerPhone, 96);

    cell(doc, L + 6, y + 30, 'Endereço', customerAddr, 210);
    cell(doc, L + 220, y + 30, 'Município', customerMunName, 115);
    cell(doc, L + 340, y + 30, 'Código IBGE / CEP', `${customerIbge} / ${customerCep}`, 100);
    cell(doc, L + 445, y + 30, 'E-mail', customerEmail, 96);
    y += 58;

    // Serviço Prestado
    doc.rect(L, y, W, 76).stroke();
    cell(doc, L + 6, y + 4, 'SERVIÇO PRESTADO', `${cTribNac}${xTribNac ? ` - ${xTribNac.slice(0, 58)}...` : ''}`, 240, true);
    cell(doc, L + 250, y + 4, 'Cód. Trib. Municipal', cTribMun, 85);
    cell(doc, L + 340, y + 4, 'Código da NBS', `${cNbs}`, 100);
    cell(doc, L + 445, y + 4, 'Local da Prestação', xLocPrest, 96);
    doc.font('Helvetica').fontSize(6.5).fillColor('#4B5563').text(xNbs, L + 340, y + 22, { width: 200, ellipsis: true });
    doc.fillColor('#111827');
    cell(doc, L + 6, y + 34, 'Descrição do Serviço', serviceDesc, W - 12);
    y += 78;

    // Tributação Municipal (ISSQN)
    doc.rect(L, y, W, 52).stroke();
    cell(doc, L + 6, y + 4, 'TRIBUTAÇÃO MUNICIPAL (ISSQN)', 'Operação tributável', 180, true);
    cell(doc, L + 195, y + 4, 'Município de Incidência', xLocIncid, 160);
    cell(doc, L + 360, y + 4, 'Retenção do ISSQN', retText, 180);

    cell(doc, L + 6, y + 28, 'BC ISSQN', formatMoney(vBc), 130);
    cell(doc, L + 145, y + 28, 'Alíquota Aplicada', `${issRate}%`, 130);
    cell(doc, L + 285, y + 28, 'ISSQN Apurado', formatMoney(issValue), 130);
    cell(doc, L + 425, y + 28, 'Regime Especial', 'Nenhum', 115);
    y += 54;

    // Tributação IBS / CBS
    doc.rect(L, y, W, 56).stroke();
    cell(doc, L + 6, y + 4, 'TRIBUTAÇÃO IBS / CBS', `CST / cClassTrib: ${cstClass}`, 190, true);
    cell(doc, L + 200, y + 4, 'Indicador Op. / Localidade Incidência', `${cIndOp} / ${customerIbge} / ${customerMunName}`, 210);
    cell(doc, L + 415, y + 4, 'Base de Cálculo IBS/CBS', ibsBc === '-' ? '-' : formatMoney(ibsBc), 125);

    cell(doc, L + 6, y + 30, 'Alíquota IBS UF / Mun', `${pIbsUf}% / ${pIbsMun}%`, 130);
    cell(doc, L + 145, y + 30, 'Valor Total IBS', formatMoney(vIbsTot), 130);
    cell(doc, L + 285, y + 30, 'Alíquota CBS', `${pCbs}%`, 130);
    cell(doc, L + 425, y + 30, 'Valor Total CBS', formatMoney(vCbsTot), 115);
    y += 58;

    // Valor Total da NFS-e
    doc.rect(L, y, W, 48).stroke();
    cell(doc, L + 6, y + 4, 'VALOR TOTAL DA NFS-e', `Operação: ${formatMoney(serviceValue)}`, 140, true);
    cell(doc, L + 150, y + 4, 'Desconto Incondicionado', descIncond === '-' ? '-' : formatMoney(descIncond), 130);
    cell(doc, L + 285, y + 4, 'Desconto Condicionado', descCond === '-' ? '-' : formatMoney(descCond), 130);
    cell(doc, L + 420, y + 4, 'Total do IBS/CBS', formatMoney(vTotalIbsCbs), 120);

    cell(doc, L + 6, y + 26, 'VALOR LÍQUIDO DA NFS-e', formatMoney(netValue), 200, true);
    cell(doc, L + 285, y + 26, 'VALOR LÍQUIDO + IBS/CBS', formatMoney(netValue), 200, true);
    y += 50;

    // Informações Complementares
    doc.rect(L, y, W, 48).stroke();
    cell(doc, L + 6, y + 4, 'INFORMAÇÕES COMPLEMENTARES', xOutInf, W - 12, true);

    doc.end();
  });
}

function cell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  label: string,
  value: string,
  width: number,
  boldTitle = false,
): void {
  doc
    .font(boldTitle ? 'Helvetica-Bold' : 'Helvetica-Bold')
    .fontSize(6.5)
    .fillColor('#374151')
    .text(label, x, y, { width, lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#111827')
    .text(value || '-', x, y + 8, { width, height: 18, ellipsis: true });
}

function obj(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' ? (val as Record<string, unknown>) : {};
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

function formatDoc(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 14) {
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (d.length === 11) {
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return raw;
}

function formatCep(raw?: string): string {
  if (!raw) return '-';
  const d = raw.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : raw;
}

function formatTribCode(raw?: string): string {
  if (!raw) return '-';
  const d = raw.replace(/\D/g, '');
  return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : raw;
}

function formatNbs(raw?: string): string {
  if (!raw) return '-';
  const d = raw.replace(/\D/g, '');
  return d.length === 9 ? `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}` : raw;
}

function formatMoney(raw: string): string {
  const num = Number(raw);
  if (!Number.isFinite(num)) return `R$ ${raw}`;
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

function formatDateBr(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : raw;
}

function formatDateTimeBr(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : raw;
}
