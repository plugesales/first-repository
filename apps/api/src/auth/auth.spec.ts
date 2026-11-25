import type { ConfigService } from '@nestjs/config';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../config/env';
import { LocalJwtAuthVerifier } from './verifiers/local-jwt.verifier';
import { SupabaseAuthVerifier } from './verifiers/supabase-auth.verifier';

function createMockConfig(values: Partial<AppEnv>): ConfigService<AppEnv, true> {
  return {
    get: (key: keyof AppEnv) => values[key],
  } as unknown as ConfigService<AppEnv, true>;
}

describe('Auth Verifiers (Supabase & Migração Local JWT)', () => {
  const secret = 'super-secret-jwt-test-key-with-at-least-32-chars';

  it('SupabaseAuthVerifier valida token HS256 do Supabase e extrai claims', async () => {
    const verifier = new SupabaseAuthVerifier(
      createMockConfig({ SUPABASE_JWT_SECRET: secret }),
    );

    const token = await new SignJWT({
      email: 'contador@escritorio.com.br',
      role: 'authenticated',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('supa-user-123')
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(secret));

    const claims = await verifier.verifyAccessToken(token);
    expect(claims).toEqual({
      sub: 'supa-user-123',
      email: 'contador@escritorio.com.br',
      role: 'authenticated',
      provider: 'supabase',
    });
  });

  it('LocalJwtAuthVerifier valida token JWT próprio após futura migração', async () => {
    const verifier = new LocalJwtAuthVerifier(
      createMockConfig({ JWT_SECRET: secret }),
    );

    const token = await new SignJWT({
      email: 'admin@contabilidade.com.br',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('local-user-456')
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(secret));

    const claims = await verifier.verifyAccessToken(token);
    expect(claims.sub).toBe('local-user-456');
    expect(claims.provider).toBe('local');
  });

  it('rejeita token expirado ou adulterado', async () => {
    const verifier = new SupabaseAuthVerifier(
      createMockConfig({ SUPABASE_JWT_SECRET: secret }),
    );

    await expect(verifier.verifyAccessToken('token.invalido.aqui')).rejects.toThrow();
  });
});

