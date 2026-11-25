import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  AuthenticatedPrincipal,
  AuthTokenClaims,
} from '@nfse-hub/nfse-types';
import type { Request } from 'express';
import {
  AUTH_VERIFIER,
  type AuthVerifier,
} from '../auth-verifier.interface';
import { AuthService } from '../auth.service';
import {
  ALLOW_WITHOUT_TENANT_KEY,
  IS_PUBLIC_KEY,
} from '../decorators/public.decorator';

export interface AuthenticatedRequest extends Request {
  authClaims?: AuthTokenClaims;
  principal?: AuthenticatedPrincipal;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // 1. Suporte a X-API-KEY para integrações de backend/n8n/webhooks
    const apiKey = request.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.trim()) {
      const requestedTenantId =
        typeof request.headers['x-tenant-id'] === 'string'
          ? request.headers['x-tenant-id'].trim()
          : undefined;
      request.principal = await this.authService.resolveApiKeyPrincipal(
        apiKey.trim(),
        requestedTenantId,
      );
      return true;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token Bearer ausente.');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Token Bearer vazio.');
    }

    const claims = await this.verifier.verifyAccessToken(token);
    request.authClaims = claims;

    const allowWithoutTenant = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WITHOUT_TENANT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requestedTenantId =
      typeof request.headers['x-tenant-id'] === 'string'
        ? request.headers['x-tenant-id'].trim()
        : undefined;

    if (allowWithoutTenant) {
      try {
        request.principal = await this.authService.resolvePrincipal(
          claims,
          requestedTenantId,
        );
      } catch {
        // Rota de onboarding permite seguir apenas com authClaims válidos
      }
      return true;
    }

    request.principal = await this.authService.resolvePrincipal(
      claims,
      requestedTenantId,
    );
    return true;
  }
}

