import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthTokenClaims } from '@nfse-hub/nfse-types';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import type { AppEnv } from '../../config/env';
import type { AuthVerifier } from '../auth-verifier.interface';

/**
 * Verificador de JWT do Supabase Auth.
 * Suporta tokens HS256 (SUPABASE_JWT_SECRET) e RS256/ES256 via JWKS (SUPABASE_URL).
 */
@Injectable()
export class SupabaseAuthVerifier implements AuthVerifier {
  private jwks: JWTVerifyGetKey | null = null;
  private jwksUrl: string | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async verifyAccessToken(token: string): Promise<AuthTokenClaims> {
    const supabaseUrl = this.config.get('SUPABASE_URL', { infer: true });
    const jwtSecret = this.config.get('SUPABASE_JWT_SECRET', { infer: true });

    let alg: string | undefined;
    try {
      alg = decodeProtectedHeader(token).alg;
    } catch {
      throw new UnauthorizedException('Token JWT malformado.');
    }

    try {
      if (alg === 'HS256') {
        if (!jwtSecret) {
          throw new UnauthorizedException(
            'SUPABASE_JWT_SECRET não configurado para validar tokens HS256.',
          );
        }
        const secret = new TextEncoder().encode(jwtSecret);
        const { payload } = await jwtVerify(token, secret);
        return this.extractClaims(payload);
      }

      if (!supabaseUrl) {
        throw new UnauthorizedException(
          'SUPABASE_URL não configurado para validar tokens via JWKS.',
        );
      }

      const expectedJwksUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
      if (!this.jwks || this.jwksUrl !== expectedJwksUrl) {
        this.jwksUrl = expectedJwksUrl;
        this.jwks = createRemoteJWKSet(new URL(expectedJwksUrl));
      }

      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: `${supabaseUrl.replace(/\/$/, '')}/auth/v1`,
      });
      return this.extractClaims(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
  }

  private extractClaims(payload: Record<string, unknown>): AuthTokenClaims {
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) {
      throw new UnauthorizedException('Token JWT sem identificador sub.');
    }
    return {
      sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      role: typeof payload.role === 'string' ? payload.role : undefined,
      provider: 'supabase',
    };
  }
}
