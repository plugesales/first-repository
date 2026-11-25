import type { NfseProvider, ProviderCode } from '@nfse-hub/nfse-types';

export interface MunicipalityRouteDescriptor {
  ibgeCode: string;
  providerCode: ProviderCode;
  authorizationMode: string;
  active: boolean;
}

/**
 * Registro central de conectores fiscais por código IBGE e provedor.
 * Evita condicionais espalhadas pelo sistema.
 */
export class ProviderRegistry {
  private readonly providers = new Map<ProviderCode, NfseProvider>();

  register(provider: NfseProvider): void {
    this.providers.set(provider.providerCode, provider);
  }

  getByCode(code: ProviderCode): NfseProvider | undefined {
    return this.providers.get(code);
  }

  async resolve(input: {
    municipalityCode: string;
    companyId: string;
    preferredProviderCode?: ProviderCode;
  }): Promise<NfseProvider> {
    if (input.preferredProviderCode) {
      const preferred = this.providers.get(input.preferredProviderCode);
      if (
        preferred &&
        (await preferred.supports({
          municipalityCode: input.municipalityCode,
          companyId: input.companyId,
        }))
      ) {
        return preferred;
      }
    }

    for (const provider of this.providers.values()) {
      if (
        await provider.supports({
          municipalityCode: input.municipalityCode,
          companyId: input.companyId,
        })
      ) {
        return provider;
      }
    }

    throw new Error(
      `Nenhum conector habilitado encontrado para o município IBGE ${input.municipalityCode}.`,
    );
  }
}

