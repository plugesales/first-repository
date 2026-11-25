import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { AppEnv } from '../config/env';
import { AUTH_VERIFIER } from './auth-verifier.interface';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { LocalJwtAuthVerifier } from './verifiers/local-jwt.verifier';
import { SupabaseAuthVerifier } from './verifiers/supabase-auth.verifier';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SupabaseAuthVerifier,
    LocalJwtAuthVerifier,
    {
      provide: AUTH_VERIFIER,
      inject: [ConfigService, SupabaseAuthVerifier, LocalJwtAuthVerifier],
      useFactory: (
        config: ConfigService<AppEnv, true>,
        supabaseVerifier: SupabaseAuthVerifier,
        localVerifier: LocalJwtAuthVerifier,
      ) => {
        const provider = config.get('AUTH_PROVIDER', { infer: true });
        return provider === 'local' ? localVerifier : supabaseVerifier;
      },
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [AuthService, AUTH_VERIFIER],
})
export class AuthModule {}

