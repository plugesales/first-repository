import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import type { Request } from 'express';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateServiceCatalogDto } from './dto/service-catalog.dto';
import { ServicesCatalogService } from './services-catalog.service';

@Controller('services')
export class ServicesCatalogController {
  constructor(private readonly service: ServicesCatalogService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateServiceCatalogDto,
    @Req() req: Request,
  ) {
    return this.service.create(principal, dto, req.ip);
  }

  @Get()
  findAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.findAll(principal.tenantId, companyId);
  }
}

