import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import type { Request } from 'express';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateServiceCatalogDto,
  UpdateServiceCatalogDto,
} from './dto/service-catalog.dto';
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

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateServiceCatalogDto,
    @Req() req: Request,
  ) {
    return this.service.update(principal, id, dto, req.ip);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.service.remove(principal, id, req.ip);
  }
}

