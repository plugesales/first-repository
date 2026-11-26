import type {
  NfseEmissionInput,
  NfseEmissionResult,
  NfseProvider,
  NfseProviderError,
  ProviderCode,
  ProviderRuntimeDeps,
} from '@nfse-hub/nfse-types';
import {
  DpsXmlValidator,
  NFSE_NAMESPACE,
  XmlDsigSigner,
  buildCancelEventXml,
  buildDpsXml,
  buildSoapHeaderXml,
  formatNfseDateTime,
} from '@nfse-hub/xml-engine';
import { XMLParser } from 'fast-xml-parser';

const DEFAULT_ISSNET_HOMOLOGATION_URL =
  'https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx';

export interface NotaControlDfOptions {
  deps?: ProviderRuntimeDeps;
  supportsCheck?: (ibgeCode: string) => Promise<boolean>;
  appVersion?: string;
}

/**
 * Conector para o padrão Nota Control / ISS.net v1.01 (DF e municípios conveniados).
 * Segue o Manual de Integração Webservice v1.01:
 * - SOAP Document/Literal wrapped com <nfseCabecMsg> e <nfseDadosMsg>
 * - Autenticação mTLS via certificado A1 em memória
 * - Assinatura XMLDSig RSA-SHA1 / C14N
 */
export class NotaControlDfProvider implements NfseProvider {
  readonly providerCode: ProviderCode = 'NOTA_CONTROL_DF';
  private readonly signer = new XmlDsigSigner();
  private readonly validator = new DpsXmlValidator();
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    attributeNamePrefix: '@_',
    parseTagValue: false,
  });
  private readonly appVersion: string;

  constructor(private readonly options: NotaControlDfOptions = {}) {
    this.appVersion = options.appVersion ?? 'nfse-hub-1.0';
  }

  async supports(input: {
    municipalityCode: string;
    companyId: string;
  }): Promise<boolean> {
    if (this.options.supportsCheck) {
      return this.options.supportsCheck(input.municipalityCode);
    }
    return false;
  }

  async getMunicipalParameters(input: {
    municipalityCode: string;
    companyId: string;
  }): Promise<unknown> {
    const deps = this.requireDeps();
    const [context, certificate] = await Promise.all([
      deps.getCompanyContext(input.companyId),
      deps.getCertificate(input.companyId),
    ]);

    const docDigits = context.document.replace(/\D/g, '');
    const docTag = docDigits.length === 14 ? 'CNPJ' : 'CPF';
    const dadosMsg = `<ConsultarDadosCadastraisEnvio xmlns="${NFSE_NAMESPACE}"><Prestador><${docTag}>${docDigits}</${docTag}><IM>${escapeXml(context.municipalReg)}</IM></Prestador></ConsultarDadosCadastraisEnvio>`;

    const res = await this.sendSoap({
      endpointUrl: this.resolveEndpoint(context.endpointUrl, context.environment),
      method: 'ConsultarDadosCadastrais',
      layoutVersion: context.layoutVersion ?? '1.01',
      dadosXml: dadosMsg,
      certificate,
    });

    return this.xmlParser.parse(res.body);
  }

  async issue(input: NfseEmissionInput): Promise<NfseEmissionResult> {
    const deps = this.requireDeps();
    const [context, certificate] = await Promise.all([
      deps.getCompanyContext(input.companyId),
      deps.getCertificate(input.companyId),
    ]);

    const dpsNumber = await deps.allocateDpsNumber(
      context.companyId,
      context.dpsSeries,
    );

    const layoutVersion = context.layoutVersion ?? '1.01';
    const requiresIbsCbs =
      layoutVersion === '1.01' && input.competenceDate.slice(0, 10) >= '2026-10-01';
    const built = buildDpsXml({
      environment: context.environment,
      appVersion: this.appVersion,
      dpsSeries: context.dpsSeries,
      dpsNumber,
      issuedAtUtc: formatNfseDateTime(),
      layoutVersion,
      ibscbs: input.ibscbs ?? (requiresIbsCbs ? {} : undefined),
      provider: {
        document: context.document,
        municipalReg: context.municipalReg,
        municipalityCode: context.municipalityCode,
        simplesNacionalOpt: context.simplesNacionalOpt,
        specialTaxRegime: context.specialTaxRegime,
      },
      emission: {
        ...input,
        // Manual ISS/DF v1.01 exige <cTribMun> (1-1) dentro de <cServ>; no DF o código municipal corresponde aos 4 primeiros dígitos (item LC 116, ex.: 1706).
        municipalTaxCode:
          input.municipalTaxCode?.trim() ||
          input.serviceCode.replace(/\D/g, '').slice(0, 4),
      },
    });

    const signedDps = this.signer.signXml({
      xml: built.xml,
      referenceTag: 'infDPS',
      certificate,
    });

    const validation = this.validator.validateDps({
      xml: signedDps,
      expectedVersion: layoutVersion,
      requireSignature: true,
    });

    if (!validation.valid) {
      return {
        status: 'rejected',
        provider: this.providerCode,
        dpsId: built.dpsId,
        errors: validation.errors.map((message, idx) => ({
          code: `LOCAL_XSD_${idx + 1}`,
          message,
        })),
      };
    }

    const signedDpsBody = signedDps.replace(/^<\?xml[^?]*\?>\s*/i, '');
    const dadosMsg = `<GerarNfseEnvio xmlns="${NFSE_NAMESPACE}">${signedDpsBody}</GerarNfseEnvio>`;

    const res = await this.sendSoap({
      endpointUrl: this.resolveEndpoint(context.endpointUrl, context.environment),
      method: 'GerarNfse',
      layoutVersion,
      dadosXml: dadosMsg,
      certificate,
    });

    return this.parseSoapNfseResponse(
      res.statusCode,
      res.body,
      'GerarNfseResult',
      built.dpsId,
    );
  }

  async consult(input: {
    accessKey?: string;
    dpsId?: string;
    companyId: string;
  }): Promise<NfseEmissionResult> {
    const deps = this.requireDeps();
    const [context, certificate] = await Promise.all([
      deps.getCompanyContext(input.companyId),
      deps.getCertificate(input.companyId),
    ]);

    const layoutVersion = context.layoutVersion ?? '1.01';
    const docDigits = context.document.replace(/\D/g, '');
    const docTag = docDigits.length === 14 ? 'CNPJ' : 'CPF';

    // Extrai série e número do TSIdDPS (45 posições) caso informado
    const series =
      input.dpsId && input.dpsId.length === 45
        ? String(Number(input.dpsId.slice(25, 30)))
        : context.dpsSeries;
    const numDps =
      input.dpsId && input.dpsId.length === 45
        ? String(BigInt(input.dpsId.slice(30, 45)))
        : '1';

    const dadosMsg = `<ConsultarNfseDpsEnvio xmlns="${NFSE_NAMESPACE}"><IdentificacaoDps><SerieDPS>${series}</SerieDPS><NumDPS>${numDps}</NumDPS></IdentificacaoDps><Prestador><${docTag}>${docDigits}</${docTag}><IM>${escapeXml(context.municipalReg)}</IM></Prestador></ConsultarNfseDpsEnvio>`;

    const res = await this.sendSoap({
      endpointUrl: this.resolveEndpoint(context.endpointUrl, context.environment),
      method: 'ConsultarNfsePorDps',
      layoutVersion,
      dadosXml: dadosMsg,
      certificate,
    });

    return this.parseSoapNfseResponse(
      res.statusCode,
      res.body,
      'ConsultarNfsePorDpsResult',
      input.dpsId,
    );
  }

  async cancel(input: {
    accessKey: string;
    companyId: string;
    reasonCode: string;
    reason: string;
  }): Promise<NfseEmissionResult> {
    const deps = this.requireDeps();
    const [context, certificate] = await Promise.all([
      deps.getCompanyContext(input.companyId),
      deps.getCertificate(input.companyId),
    ]);

    const layoutVersion = context.layoutVersion ?? '1.01';
    const eventBuilt = buildCancelEventXml({
      environment: context.environment,
      appVersion: this.appVersion,
      eventDateUtc: formatNfseDateTime(),
      authorDocument: context.document,
      accessKey: input.accessKey,
      reasonCode: input.reasonCode,
      reason: input.reason,
      layoutVersion,
    });

    const signedEvent = this.signer.signXml({
      xml: eventBuilt.xml,
      referenceTag: 'infPedReg',
      certificate,
    });

    const dadosMsg = `<CancelarNfseEnvio xmlns="${NFSE_NAMESPACE}">${signedEvent}</CancelarNfseEnvio>`;

    const res = await this.sendSoap({
      endpointUrl: this.resolveEndpoint(context.endpointUrl, context.environment),
      method: 'CancelarNfse',
      layoutVersion,
      dadosXml: dadosMsg,
      certificate,
    });

    if (res.statusCode >= 500 || res.statusCode === 0) {
      return {
        status: 'unknown',
        provider: this.providerCode,
        accessKey: input.accessKey,
        errors: [
          {
            code: `HTTP_${res.statusCode}`,
            message: res.body.slice(0, 300),
          },
        ],
      };
    }

    const innerXml = this.extractSoapResultXml(res.body, 'CancelarNfseResult');
    const errors = this.extractMensagensRetorno(innerXml);
    if (errors.length > 0) {
      return {
        status: 'rejected',
        provider: this.providerCode,
        accessKey: input.accessKey,
        errors,
      };
    }

    return {
      status: 'cancelled',
      provider: this.providerCode,
      accessKey: input.accessKey,
      xml: innerXml ?? res.body,
    };
  }

  private async sendSoap(params: {
    endpointUrl: string;
    method: string;
    layoutVersion: '1.00' | '1.01';
    dadosXml: string;
    certificate: { pfxBuffer: Buffer; passphrase: string };
  }) {
    const deps = this.requireDeps();
    const cabecXml = buildSoapHeaderXml(params.layoutVersion);
    const cleanDadosXml = params.dadosXml.replace(/^<\?xml[^?]*\?>\s*/i, '');

    const envelope = [
      `<?xml version="1.0" encoding="utf-8"?>`,
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="${NFSE_NAMESPACE}">`,
      `<soapenv:Header/>`,
      `<soapenv:Body>`,
      `<nfse:${params.method}>`,
      `<nfse:nfseCabecMsg>${cabecXml}</nfse:nfseCabecMsg>`,
      `<nfse:nfseDadosMsg>${cleanDadosXml}</nfse:nfseDadosMsg>`,
      `</nfse:${params.method}>`,
      `</soapenv:Body>`,
      `</soapenv:Envelope>`,
    ].join('');

    return deps.mtlsTransport.request({
      url: params.endpointUrl,
      method: 'POST',
      headers: {
        'content-type': 'text/xml; charset=utf-8',
        SOAPAction: `${NFSE_NAMESPACE}/${params.method}`,
      },
      body: envelope,
      certificate: params.certificate,
    });
  }

  private parseSoapNfseResponse(
    statusCode: number,
    soapBody: string,
    resultTagName: string,
    dpsId?: string,
  ): NfseEmissionResult {
    if (statusCode >= 500 || statusCode === 0) {
      return {
        status: 'unknown',
        provider: this.providerCode,
        dpsId,
        errors: [
          {
            code: `HTTP_${statusCode}`,
            message: soapBody.slice(0, 300),
          },
        ],
      };
    }

    const innerXml = this.extractSoapResultXml(soapBody, resultTagName);
    if (!innerXml) {
      const preview = soapBody.replace(/\s+/g, ' ').trim().slice(0, 400);
      console.error(`[NOTA_CONTROL_DF] INVALID_SOAP_RESPONSE (HTTP ${statusCode}): ${preview}`);
      return {
        status: 'unknown',
        provider: this.providerCode,
        dpsId,
        errors: [
          {
            code: 'INVALID_SOAP_RESPONSE',
            message: `Resposta SOAP não contém o nó de resultado esperado (HTTP ${statusCode}): ${preview}`,
          },
        ],
      };
    }

    const errors = this.extractMensagensRetorno(innerXml);
    if (errors.length > 0) {
      return {
        status: 'rejected',
        provider: this.providerCode,
        dpsId,
        errors,
      };
    }

    const parsed = this.xmlParser.parse(innerXml) as Record<string, unknown>;
    const root = Object.values(parsed)[0] as Record<string, unknown> | undefined;
    const nestedRoot = (root?.GerarNfseResposta ?? root?.ConsultarNfseRpsResposta ?? root?.ConsultarNfseDpsResposta ?? root) as
      | Record<string, unknown>
      | undefined;
    const listaNfse = (nestedRoot?.ListaNfse ?? root?.ListaNfse) as
      | Record<string, unknown>
      | undefined;
    const compNfse = (listaNfse?.CompNfse ?? nestedRoot?.CompNfse ?? root?.CompNfse) as
      | Record<string, unknown>
      | undefined;
    const nfse = (compNfse?.NFSe ?? compNfse?.Nfse ?? compNfse) as
      | Record<string, unknown>
      | undefined;
    const infNfse = (nfse?.infNFSe ?? nfse?.InfNfse ?? nfse) as
      | Record<string, unknown>
      | undefined;

    const accessKey =
      typeof infNfse?.['@_Id'] === 'string'
        ? infNfse['@_Id'].replace(/^NFS/, '')
        : undefined;
    const invoiceNumber =
      infNfse?.nNFSe !== undefined ? String(infNfse.nNFSe) : undefined;

    if (!infNfse) {
      return {
        status: 'unknown',
        provider: this.providerCode,
        dpsId,
        xml: innerXml,
      };
    }

    return {
      status: 'authorized',
      provider: this.providerCode,
      dpsId,
      accessKey,
      invoiceNumber,
      xml: innerXml,
    };
  }

  private extractSoapResultXml(
    soapBody: string,
    resultTagName: string,
  ): string | null {
    // 1. Limpeza de BOM (Byte Order Mark \uFEFF)
    const cleanSoap = soapBody.replace(/^\uFEFF/, '').trim();

    // 2. Tenta extrair a tag diretamente via regex para evitar perdas de formatação do SOAP XML
    const tagBase = resultTagName.replace(/Result$/, '');
    const innerMatch = cleanSoap.match(
      new RegExp(
        `<(?:\\w+:)?(${resultTagName}|${tagBase}Resposta)\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?\\1>`,
        'i',
      ),
    );
    if (innerMatch) {
      let content = innerMatch[2] || innerMatch[0];
      if (content.includes('&lt;') && content.includes('&gt;')) {
        content = content
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        return content;
      }
      return innerMatch[1].toLowerCase().endsWith('resposta')
        ? innerMatch[0]
        : content;
    }

    const parsed = this.xmlParser.parse(cleanSoap) as Record<string, unknown>;
    const envelope = (parsed.Envelope ?? parsed.envelope) as
      | Record<string, unknown>
      | undefined;
    const body = (envelope?.Body ?? envelope?.body) as
      | Record<string, unknown>
      | undefined;
    if (!body) return null;

    for (const key of Object.keys(body)) {
      const responseObj = body[key] as Record<string, unknown> | undefined;
      if (responseObj && typeof responseObj[resultTagName] === 'string') {
        let content = responseObj[resultTagName] as string;
        if (content.includes('&lt;') && content.includes('&gt;')) {
          content = content
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
        }
        return content;
      }
      if (
        responseObj &&
        (typeof responseObj[resultTagName] === 'object' ||
          typeof responseObj[`${tagBase}Resposta`] === 'object')
      ) {
        return cleanSoap;
      }
    }
    return null;
  }

  private extractMensagensRetorno(xml: string | null): NfseProviderError[] {
    if (!xml) return [];
    const parsed = this.xmlParser.parse(xml) as Record<string, unknown>;
    const root = Object.values(parsed)[0] as Record<string, unknown> | undefined;
    const nestedRoot = (root?.GerarNfseResposta ?? root?.ConsultarNfseRpsResposta ?? root?.ConsultarNfseDpsResposta ?? root) as
      | Record<string, unknown>
      | undefined;
    const lista = (nestedRoot?.ListaMensagemRetorno ?? root?.ListaMensagemRetorno) as
      | { MensagemRetorno?: unknown }
      | undefined;
    if (!lista?.MensagemRetorno) return [];

    const items = Array.isArray(lista.MensagemRetorno)
      ? lista.MensagemRetorno
      : [lista.MensagemRetorno];

    return items.map((item) => {
      const obj = item as Record<string, unknown>;
      return {
        code: String(obj.Codigo ?? 'ERR'),
        message: String(obj.Mensagem ?? 'Erro retornado pelo Webservice.'),
        correction: obj.Correcao ? String(obj.Correcao) : undefined,
      };
    });
  }

  private resolveEndpoint(
    configuredUrl: string | undefined,
    environment: 'HOMOLOGATION' | 'PRODUCTION',
  ): string {
    if (configuredUrl) return configuredUrl;
    if (environment === 'HOMOLOGATION') {
      return DEFAULT_ISSNET_HOMOLOGATION_URL;
    }
    throw new Error(
      'Endpoint de produção do município não configurado no cadastro de Municípios.',
    );
  }

  private requireDeps(): ProviderRuntimeDeps {
    if (!this.options.deps) {
      throw new Error(
        'NotaControlDfProvider inicializado sem ProviderRuntimeDeps.',
      );
    }
    return this.options.deps;
  }
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
