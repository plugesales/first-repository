/**
 * Núcleo de regras fiscais compartilhadas (ISSQN, deduções, valor líquido,
 * retenções federais e futura apuração IBS/CBS conforme Manual v1.01).
 */
export interface FiscalCalculationInput {
  serviceAmount: number;
  unconditionalDiscount?: number;
  conditionalDiscount?: number;
  deductions?: number;
  issRate?: number;
  issWithheld?: boolean;
  retCP?: number;
  retIRRF?: number;
  retCSLL?: number;
  retPIS?: number;
  retCOFINS?: number;
}

export interface FiscalCalculationResult {
  issBaseAmount: number;
  issAmount: number;
  totalWithheld: number;
  netAmount: number;
}

/**
 * Calcula base de cálculo de ISSQN e valor líquido conforme seção 5.1 do Manual v1.01:
 * - BC ISSQN = vServ - vDescIncond - deducoes
 * - CP, IRRF e CSLL sempre reduzem o valor líquido; ISSQN apenas quando retido.
 */
export function calculateBasicNfseTotals(
  input: FiscalCalculationInput,
): FiscalCalculationResult {
  const serviceAmount = roundCurrency(input.serviceAmount);
  const unconditionalDiscount = roundCurrency(input.unconditionalDiscount ?? 0);
  const conditionalDiscount = roundCurrency(input.conditionalDiscount ?? 0);
  const deductions = roundCurrency(input.deductions ?? 0);

  const issBaseAmount = Math.max(
    0,
    roundCurrency(serviceAmount - deductions - unconditionalDiscount),
  );
  const issRate = input.issRate ?? 0;
  const issAmount = roundCurrency((issBaseAmount * issRate) / 100);

  const retCP = roundCurrency(input.retCP ?? 0);
  const retIRRF = roundCurrency(input.retIRRF ?? 0);
  const retCSLL = roundCurrency(input.retCSLL ?? 0);
  const retPIS = roundCurrency(input.retPIS ?? 0);
  const retCOFINS = roundCurrency(input.retCOFINS ?? 0);
  const retISS = input.issWithheld ? issAmount : 0;

  const totalWithheld = roundCurrency(
    retCP + retIRRF + retCSLL + retPIS + retCOFINS + retISS,
  );
  const netAmount = Math.max(
    0,
    roundCurrency(
      serviceAmount - unconditionalDiscount - conditionalDiscount - totalWithheld,
    ),
  );

  return {
    issBaseAmount,
    issAmount,
    totalWithheld,
    netAmount,
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

