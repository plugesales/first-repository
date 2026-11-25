import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { AuthenticatedPrincipal, AuthTokenClaims } from '@nfse-hub/nfse-types';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  CurrentClaims,
  CurrentPrincipal,
} from './decorators/current-principal.decorator';
import { AllowWithoutTenant } from './decorators/public.decorator';
import { OnboardingDto } from './dto/onboarding.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  me(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return principal;
  }

  @Post('onboarding')
  @AllowWithoutTenant()
  onboarding(
    @CurrentClaims() claims: AuthTokenClaims,
    @Body() dto: OnboardingDto,
    @Req() req: Request,
  ) {
    return this.authService.onboardTenant(claims, dto, req.ip);
  }
}

