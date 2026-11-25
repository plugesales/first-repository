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
  XmlDsigSigner,
  buildCancelEventXml,
  buildDpsXml,
  formatNfseDateTime,
} from '@nfse-hub/xml-engine';
import * as zlib from 'node:zlib';

const DEFAULT_SEFIN_BASE_URLS = {
  PRODUCTION: 'https://sefin.nfse.gov.br/sefinnacional',
  HOMOLOGATION: 'https://sefin.producaorestrita.nfse.gov.br/sefinnacional',
} as const;

const DEFAULT_PARAM_BASE_URLS = {
  PRODUCTION: 'https://adn.nfse.gov.br/parametrizacao',
  HOMOLOGATION: 'https://adn.producaorestrita.nfse.gov.br/parametrizacao',
} as const;

export interface NationalSefinOptions {
  deps?: ProviderRuntimeDeps;
  supportsCheck?: (ibgeCode: string) => Promise<boolean>;
  appVersion?: string;
}

export class NationalSefinProvider implements NfseProvider {
  readonly providerCode: ProviderCode = 'NATIONAL_SEFIN';
  private readonly signer = new XmlDsigSigner();
  private readonly validator = new DpsXmlValidator();
  private readonly appVersion: string;

  constructor(private readonly options: NationalSefinOptions = {}) {
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
    serviceCode?: string;
  }): Promise<unknown> {
    const deps = this.requireDeps();
    const [context, certificate] = await Promise.all([
      deps.getCompanyContext(input.companyId),
      deps.getCertificate(input.companyId),
    ]);

    const baseUrl = DEFAULT_PARAM_BASE_URLS[context.environment];
    const path = input.serviceCode
      ? `/${input.municipalityCode}/${encodeURIComponent(input.serviceCode)}/aliquota`
      : `/${input.municipalityCode}/convenio`;

    const res = await deps.mtlsTransport.request({
      url: `${baseUrl}${path}`,
      method: 'GET',
      headers: { accept: 'application/json' },
      certificate,
    });

    if (res.statusCode >= 400) {
      throw new Error(
        `SEFIN Parâmetros HTTP ${res.statusCode}: ${res.body.slice(0, 300)}`,
      );
    }

    return res.body ? JSON.parse(res.body) : {};
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

    const built = buildDpsXml({
      environment: context.environment,
      appVersion: this.appVersion,
      dpsSeries: context.dpsSeries,
      dpsNumber,
      issuedAtUtc: formatNfseDateTime(),
      layoutVersion: context.layoutVersion ?? '1.01',
      finNFSe: '0',
      provider: {
        document: context.document,
        municipalReg: context.municipalReg,
        municipalityCode: context.municipalityCode,
        simplesNacionalOpt: context.simplesNacionalOpt,
        specialTaxRegime: context.specialTaxRegime,
      },
      emission: input,
    });

    const signedXml = this.signer.signXml({
      xml: built.xml,
      referenceTag: 'infDPS',
      certificate,
    });

    const validation = this.validator.validateDps({
      xml: signedXml,
      expectedVersion: context.layoutVersion ?? '1.01',
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

    const dpsXmlGZipB64 = zlib
      .gzipSync(Buffer.from(signedXml, 'utf8'))
      .toString('base64');

    const rawBase =
      context.endpointUrl || DEFAULT_SEFIN_BASE_URLS[context.environment];
    const baseUrl = rawBase.replace(/\/nfse\/?$/, '').replace(/\/$/, '');

    const res = await deps.mtlsTransport.request({
      url: `${baseUrl}/nfse`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ dpsXmlGZipB64 }),
      certificate,
    });

    return this.parseEmissionResponse(res.statusCode, res.body, built.dpsId);
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

    const baseUrl = (
      context.endpointUrl || DEFAULT_SEFIN_BASE_URLS[context.environment]
    ).replace(/\/$/, '');

    let accessKey = input.accessKey;
    if (!accessKey && input.dpsId) {
      const dpsRes = await deps.mtlsTransport.request({
        url: `${baseUrl}/dps/${encodeURIComponent(input.dpsId)}`,
        method: 'GET',
        headers: { accept: 'application/json' },
        certificate,
      });

      if (dpsRes.statusCode === 404) {
        return {
          status: 'rejected',
          provider: this.providerCode,
          dpsId: input.dpsId,
          errors: [
            {
              code: 'DPS_NOT_FOUND',
              message: 'DPS não localizada na SEFIN Nacional.',
            },
          ],
        };
      }

      if (dpsRes.statusCode >= 500) {
        return {
          status: 'unknown',
          provider: this.providerCode,
          dpsId: input.dpsId,
          errors: [
            {
              code: `HTTP_${dpsRes.statusCode}`,
              message: dpsRes.body.slice(0, 300),
            },
          ],
        };
      }

      const dpsData = dpsRes.body
        ? (JSON.parse(dpsRes.body) as { chaveAcesso?: string })
        : {};
      accessKey = dpsData.chaveAcesso;
    }

    if (!accessKey) {
      return {
        status: 'unknown',
        provider: this.providerCode,
        dpsId: input.dpsId,
        errors: [
          {
            code: 'MISSING_ACCESS_KEY',
            message: 'Chave de acesso não retornada pela consulta de DPS.',
          },
        ],
      };
    }

    const nfseRes = await deps.mtlsTransport.request({
      url: `${baseUrl}/nfse/${encodeURIComponent(accessKey)}`,
      method: 'GET',
      headers: { accept: 'application/json' },
      certificate,
    });

    return this.parseEmissionResponse(
      nfseRes.statusCode,
      nfseRes.body,
      input.dpsId,
      accessKey,
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

    const eventBuilt = buildCancelEventXml({
      environment: context.environment,
      appVersion: this.appVersion,
      eventDateUtc: formatNfseDateTime(),
      authorDocument: context.document,
      accessKey: input.accessKey,
      reasonCode: input.reasonCode,
      reason: input.reason,
      layoutVersion: context.layoutVersion ?? '1.01',
    });

    const signedEvent = this.signer.signXml({
      xml: eventBuilt.xml,
      referenceTag: 'infPedReg',
      certificate,
    });

    const pedidoRegistroEventoXmlGZipB64 = zlib
      .gzipSync(Buffer.from(signedEvent, 'utf8'))
      .toString('base64');

    const baseUrl = (
      context.endpointUrl || DEFAULT_SEFIN_BASE_URLS[context.environment]
    ).replace(/\/$/, '');

    const res = await deps.mtlsTransport.request({
      url: `${baseUrl}/nfse/${encodeURIComponent(input.accessKey)}/eventos`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ pedidoRegistroEventoXmlGZipB64 }),
      certificate,
    });

    if (res.statusCode >= 200 && res.statusCode < 300) {
      const payload = res.body
        ? (JSON.parse(res.body) as {
            eventoXmlGZipB64?: string;
            nSeqEvento?: string;
          })
        : {};
      return {
        status: 'cancelled',
        provider: this.providerCode,
        accessKey: input.accessKey,
        protocol: payload.nSeqEvento,
        xml: payload.eventoXmlGZipB64
          ? zlib
              .gunzipSync(Buffer.from(payload.eventoXmlGZipB64, 'base64'))
              .toString('utf8')
          : undefined,
      };
    }

    return this.parseErrorResponse(res.statusCode, res.body, input.accessKey);
  }

  private parseEmissionResponse(
    statusCode: number,
    rawBody: string,
    dpsId?: string,
    fallbackKey?: string,
  ): NfseEmissionResult {
    if (statusCode >= 200 && statusCode < 300) {
      const data = rawBody
        ? (JSON.parse(rawBody) as {
            chaveAcesso?: string;
            nfseXmlGZipB64?: string;
            nNFSe?: string;
          })
        : {};

      const xml = data.nfseXmlGZipB64
        ? zlib
            .gunzipSync(Buffer.from(data.nfseXmlGZipB64, 'base64'))
            .toString('utf8')
        : undefined;

      return {
        status: 'authorized',
        provider: this.providerCode,
        dpsId,
        accessKey: data.chaveAcesso ?? fallbackKey,
        invoiceNumber: data.nNFSe,
        xml,
      };
    }

    return this.parseErrorResponse(statusCode, rawBody, fallbackKey, dpsId);
  }

  private parseErrorResponse(
    statusCode: number,
    rawBody: string,
    accessKey?: string,
    dpsId?: string,
  ): NfseEmissionResult {
    const errors: NfseProviderError[] = [];
    try {
      const parsed = rawBody
        ? (JSON.parse(rawBody) as {
            erros?: Array<Record<string, unknown>>;
            Erros?: Array<Record<string, unknown>>;
            mensagem?: string;
            Mensagem?: string;
          })
        : {};
      const listaErros = parsed.erros ?? parsed.Erros;
      if (Array.isArray(listaErros)) {
        for (const err of listaErros) {
          const codigo = String(err.Codigo ?? err.codigo ?? `HTTP_${statusCode}`);
          const desc = String(
            err.Descricao ??
              err.descricao ??
              err.Mensagem ??
              'Erro retornado pela SEFIN Nacional.',
          );
          const comp = err.Complemento ?? err.complemento;
          const extraKeys = Object.entries(err)
            .filter(
              ([k, v]) =>
                v !== undefined &&
                v !== null &&
                v !== '' &&
                ![
                  'Codigo',
                  'codigo',
                  'Descricao',
                  'descricao',
                  'Complemento',
                  'complemento',
                ].includes(k),
            )
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(', ');
          const details = [comp ? String(comp) : '', extraKeys]
            .filter(Boolean)
            .join(' | ');
          errors.push({
            code: codigo,
            message: details ? `${desc} (${details})` : desc,
          });
        }
      } else if (parsed.mensagem || parsed.Mensagem) {
        errors.push({
          code: `HTTP_${statusCode}`,
          message: String(parsed.mensagem ?? parsed.Mensagem),
        });
      } else if (rawBody) {
        errors.push({
          code: `HTTP_${statusCode}`,
          message: rawBody.slice(0, 600),
        });
      }
    } catch {
      errors.push({
        code: `HTTP_${statusCode}`,
        message: rawBody.slice(0, 400) || `Erro HTTP ${statusCode}`,
      });
    }

    return {
      status: statusCode >= 500 || statusCode === 0 ? 'unknown' : 'rejected',
      provider: this.providerCode,
      dpsId,
      accessKey,
      errors,
    };
  }

  private requireDeps(): ProviderRuntimeDeps {
    if (!this.options.deps) {
      throw new Error(
        'NationalSefinProvider inicializado sem ProviderRuntimeDeps.',
      );
    }
    return this.options.deps;
  }
}
