import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UpsertMunicipalityDto } from './dto/municipality.dto';

@Injectable()
export class MunicipalitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.municipality.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async upsert(
    principal: AuthenticatedPrincipal,
    dto: UpsertMunicipalityDto,
    ipAddress?: string,
  ) {
    const municipality = await this.prisma.municipality.upsert({
      where: { ibgeCode: dto.ibgeCode },
      create: {
        ibgeCode: dto.ibgeCode,
        name: dto.name.trim(),
        state: dto.state,
        providerCode: dto.providerCode,
        authorizationMode: dto.authorizationMode.trim(),
        layoutVersion: dto.layoutVersion ?? '1.01',
        homologationUrl: dto.homologationUrl,
        productionUrl: dto.productionUrl,
        environment: dto.environment ?? 'HOMOLOGATION',
        active: dto.active ?? true,
      },
      update: {
        name: dto.name.trim(),
        state: dto.state,
        providerCode: dto.providerCode,
        authorizationMode: dto.authorizationMode.trim(),
        ...(dto.layoutVersion ? { layoutVersion: dto.layoutVersion } : {}),
        ...(dto.homologationUrl !== undefined
          ? { homologationUrl: dto.homologationUrl }
          : {}),
        ...(dto.productionUrl !== undefined
          ? { productionUrl: dto.productionUrl }
          : {}),
        ...(dto.environment ? { environment: dto.environment } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'MUNICIPALITY_UPSERTED',
      resource: 'Municipality',
      resourceId: municipality.ibgeCode,
      metadata: {
        providerCode: municipality.providerCode,
        active: municipality.active,
      },
      ipAddress,
    });

    return municipality;
  }

  async getParameters(ibgeCode: string, serviceCode?: string) {
    const municipality = await this.prisma.municipality.findUnique({
      where: { ibgeCode },
    });
    if (!municipality) {
      throw new NotFoundException(
        `Município IBGE ${ibgeCode} não cadastrado.`,
      );
    }

    const parameters = await this.prisma.taxParameter.findMany({
      where: {
        municipalityCode: ibgeCode,
        ...(serviceCode ? { serviceCode } : {}),
      },
      orderBy: [{ version: 'desc' }, { validFrom: 'desc' }],
      take: 20,
    });

    return {
      municipality,
      parameters,
    };
  }
}

