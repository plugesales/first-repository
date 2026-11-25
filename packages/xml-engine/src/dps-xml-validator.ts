import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { NFSE_NAMESPACE, type LayoutVersion } from './dps-xml-builder';

export interface XmlValidationResult {
  valid: boolean;
  errors: string[];
}

const FORBIDDEN_SIGNATURE_TAGS = [
  'X509SubjectName',
  'X509IssuerSerial',
  'X509IssuerName',
  'X509SerialNumber',
  'X509SKI',
  'KeyValue',
  'RSAKeyValue',
  'Modulus',
  'Exponent',
];

/**
 * Validador estrutural e fiscal de XML DPS conforme Manual v1.01 (Seções 7.3.3 e 10.3).
 * Pode ser estendido com validação XSD nativa (libxml) na camada de infraestrutura.
 */
export class DpsXmlValidator {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
  });

  validateDps(params: {
    xml: string;
    expectedVersion?: LayoutVersion;
    requireSignature?: boolean;
  }): XmlValidationResult {
    const errors: string[] = [];

    const wellFormed = XMLValidator.validate(params.xml);
    if (wellFormed !== true) {
      return {
        valid: false,
        errors: [
          `XML malformado: ${wellFormed.err?.msg ?? 'erro sintático desconhecido'}`,
        ],
      };
    }

    const parsed = this.parser.parse(params.xml) as Record<string, unknown>;
    const dps = parsed.DPS as Record<string, unknown> | undefined;
    if (!dps) {
      return { valid: false, errors: ['Tag raiz <DPS> ausente.'] };
    }

    const ns = dps['@_xmlns'];
    if (ns !== NFSE_NAMESPACE) {
      errors.push(
        `Namespace inválido em <DPS>: esperado ${NFSE_NAMESPACE}, recebido ${String(ns ?? 'ausente')}.`,
      );
    }

    const version = dps['@_versao'];
    if (version !== '1.00' && version !== '1.01') {
      errors.push(`Versão de leiaute inválida: ${String(version ?? 'ausente')}.`);
    } else if (params.expectedVersion && version !== params.expectedVersion) {
      errors.push(
        `Versão divergente: esperada ${params.expectedVersion}, recebida ${version}.`,
      );
    }

    const infDps = dps.infDPS as Record<string, unknown> | undefined;
    if (!infDps) {
      errors.push('Grupo obrigatório <infDPS> ausente.');
    } else {
      const id = String(infDps['@_Id'] ?? '');
      if (!/^DPS\d{42}$/.test(id)) {
        errors.push(
          `Identificador TSIdDPS inválido (${id}): deve conter literal "DPS" + 42 dígitos.`,
        );
      }

      const requiredFields = [
        'tpAmb',
        'dhEmi',
        'verAplic',
        'serie',
        'nDPS',
        'dCompet',
        'tpEmit',
        'cLocEmi',
        'prest',
        'serv',
        'valores',
      ];
      for (const field of requiredFields) {
        if (infDps[field] === undefined || infDps[field] === null) {
          errors.push(`Campo/grupo obrigatório <${field}> ausente em <infDPS>.`);
        }
      }

      if (infDps.IBSCBS && version !== '1.01') {
        errors.push(
          'Grupo <IBSCBS> exige cabeçalho/leiaute versão 1.01 (Seção 14 do Manual).',
        );
      }
    }

    if (params.requireSignature) {
      if (!dps.Signature) {
        errors.push('Assinatura XMLDSig <Signature> ausente em <DPS>.');
      }
      for (const forbidden of FORBIDDEN_SIGNATURE_TAGS) {
        if (params.xml.includes(`<${forbidden}`)) {
          errors.push(
            `Tag proibida pelo Manual v1.01 (Seção 7.3.3) encontrada na assinatura: <${forbidden}>.`,
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

