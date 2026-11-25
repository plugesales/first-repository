import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthTokenClaims } from '@nfse-hub/nfse-types';
import { jwtVerify } from 'jose';
import type { AppEnv } from '../../config/env';
import type { AuthVerifier } from '../auth-verifier.interface';

/**
 * Verificador para futura migração do Supabase Auth para autenticação JWT própria.
 */
@Injectable()
export class LocalJwtAuthVerifier implements AuthVerifier {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async verifyAccessToken(token: string): Promise<AuthTokenClaims> {
    const secret = this.config.get('JWT_SECRET', { infer: true });
    if (!secret) {
      throw new UnauthorizedException(
        'JWT_SECRET não configurado para autenticação local.',
      );
    }

    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
      );
      const sub = typeof payload.sub === 'string' ? payload.sub : '';
      if (!sub) {
        throw new UnauthorizedException('Token JWT sem identificador sub.');
      }
      return {
        sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        role: typeof payload.role === 'string' ? payload.role : undefined,
        provider: 'local',
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token local inválido ou expirado.');
    }
  }
}

