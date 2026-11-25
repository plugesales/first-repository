import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import type { Request } from 'express';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CancelInvoiceDto,
  CreateInvoiceDto,
  QuickIssueDto,
} from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'OPERATOR')
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateInvoiceDto,
    @Req() req: Request,
  ) {
    return this.invoicesService.create(principal, dto, req.ip);
  }

  @Post('quick-issue')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'OPERATOR')
  quickIssue(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: QuickIssueDto,
    @Req() req: Request,
  ) {
    return this.invoicesService.quickIssue(principal, dto, req.ip);
  }

  @Get()
  findAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
  ) {
    return this.invoicesService.findAll(principal.tenantId, {
      companyId,
      status,
    });
  }

  @Get(':id')
  findOne(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoicesService.findOne(principal.tenantId, id);
  }

  @Get(':id/xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  getXml(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ) {
    return this.invoicesService.getAuthorizedXml(principal.tenantId, id);
  }

  @Get(':id/pdf')
  async getPdf(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const pdfBuffer = await this.invoicesService.getDanfsePdf(
      principal.tenantId,
      id,
    );
    return new StreamableFile(pdfBuffer, {
      type: 'application/pdf',
      disposition: `inline; filename="danfse-${id}.pdf"`,
    });
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  cancel(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: CancelInvoiceDto,
    @Req() req: Request,
  ) {
    return this.invoicesService.requestCancel(principal, id, dto, req.ip);
  }
}

