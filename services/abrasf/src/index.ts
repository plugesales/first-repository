import type {
  NfseEmissionInput,
  NfseEmissionResult,
  NfseProvider,
  ProviderCode,
} from '@nfse-hub/nfse-types';

export class AbrasfProvider implements NfseProvider {
  readonly providerCode: ProviderCode = 'ABRASF';

  async supports(_input: {
    municipalityCode: string;
    companyId: string;
  }): Promise<boolean> {
    return false;
  }

  async getMunicipalParameters(): Promise<unknown> {
    throw new Error(
      'Integração pendente: AbrasfProvider.getMunicipalParameters será implementada em fase posterior.',
    );
  }

  async issue(_input: NfseEmissionInput): Promise<NfseEmissionResult> {
    throw new Error(
      'Integração pendente: AbrasfProvider.issue será implementada em fase posterior.',
    );
  }

  async consult(): Promise<NfseEmissionResult> {
    throw new Error(
      'Integração pendente: AbrasfProvider.consult será implementada em fase posterior.',
    );
  }

  async cancel(): Promise<NfseEmissionResult> {
    throw new Error(
      'Integração pendente: AbrasfProvider.cancel será implementada em fase posterior.',
    );
  }
}

