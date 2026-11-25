import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal, AuthTokenClaims } from '@nfse-hub/nfse-types';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ principal: AuthenticatedPrincipal }>();
    return request.principal;
  },
);

export const CurrentClaims = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthTokenClaims => {
    const request = ctx.switchToHttp().getRequest<{ authClaims: AuthTokenClaims }>();
    return request.authClaims;
  },
);

