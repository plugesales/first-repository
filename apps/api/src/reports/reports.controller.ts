import { Controller, Get, Query } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  getSummary(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('companyId') companyId?: string,
  ) {
    return this.reportsService.getSummary(principal.tenantId, companyId);
  }
}

