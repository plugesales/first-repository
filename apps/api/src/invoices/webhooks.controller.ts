import { Body, Controller, Post, Req } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import type { Request } from 'express';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { QuickIssueDto } from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('issue')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'OPERATOR')
  issue(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: QuickIssueDto,
    @Req() req: Request,
  ) {
    return this.invoicesService.quickIssue(principal, dto, req.ip);
  }

  @Post('whatsapp-issue')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'OPERATOR')
  whatsappIssue(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: QuickIssueDto,
    @Req() req: Request,
  ) {
    return this.invoicesService.quickIssue(principal, dto, req.ip);
  }
}

