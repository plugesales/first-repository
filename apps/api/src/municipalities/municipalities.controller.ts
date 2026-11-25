import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import type { Request } from 'express';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpsertMunicipalityDto } from './dto/municipality.dto';
import { MunicipalitiesService } from './municipalities.service';

@Controller('municipalities')
export class MunicipalitiesController {
  constructor(private readonly service: MunicipalitiesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  upsert(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: UpsertMunicipalityDto,
    @Req() req: Request,
  ) {
    return this.service.upsert(principal, dto, req.ip);
  }

  @Get(':ibge/parameters')
  getParameters(
    @Param('ibge') ibge: string,
    @Query('serviceCode') serviceCode?: string,
  ) {
    return this.service.getParameters(ibge, serviceCode);
  }
}

