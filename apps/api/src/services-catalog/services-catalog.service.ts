import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateServiceCatalogDto } from './dto/service-catalog.dto';

@Injectable()
export class ServicesCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    principal: AuthenticatedPrincipal,
    dto: CreateServiceCatalogDto,
    ipAddress?: string,
  ) {
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, tenantId: principal.tenantId },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada neste escritório.');
    }

    const item = await this.prisma.serviceCatalog.create({
      data: {
        tenantId: principal.tenantId,
        companyId: company.id,
        internalCode: dto.internalCode?.trim(),
        nationalTaxCode: dto.nationalTaxCode.replace(/\D/g, ''),
        municipalTaxCode: dto.municipalTaxCode.trim(),
        nbsCode: dto.nbsCode?.replace(/\D/g, ''),
        description: dto.description.trim(),
        defaultIssRate: dto.defaultIssRate,
        issWithheldDefault: dto.issWithheldDefault ?? false,
      },
    });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'SERVICE_CATALOG_CREATED',
      resource: 'ServiceCatalog',
      resourceId: item.id,
      metadata: {
        companyId: company.id,
        nationalTaxCode: item.nationalTaxCode,
      },
      ipAddress,
    });

    return item;
  }

  findAll(tenantId: string, companyId?: string) {
    return this.prisma.serviceCatalog.findMany({
      where: {
        tenantId,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

