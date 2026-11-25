import type { AuthTokenClaims } from '@nfse-hub/nfse-types';

export const AUTH_VERIFIER = Symbol('AUTH_VERIFIER');

export interface AuthVerifier {
  verifyAccessToken(token: string): Promise<AuthTokenClaims>;
}

