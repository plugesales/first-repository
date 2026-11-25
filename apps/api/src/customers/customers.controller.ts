import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import type { Request } from 'express';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'OPERATOR')
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateCustomerDto,
    @Req() req: Request,
  ) {
    return this.customersService.create(principal, dto, req.ip);
  }

  @Get()
  findAll(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.customersService.findAll(principal.tenantId);
  }

  @Get(':id')
  findOne(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.customersService.findOne(principal.tenantId, id);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'OPERATOR')
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() req: Request,
  ) {
    return this.customersService.update(principal, id, dto, req.ip);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.customersService.remove(principal, id, req.ip);
  }
}

