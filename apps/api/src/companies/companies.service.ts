import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    principal: AuthenticatedPrincipal,
    dto: CreateCompanyDto,
    ipAddress?: string,
  ) {
    const normalizedDocument = dto.document.replace(/\D/g, '');
    if (normalizedDocument.length !== 11 && normalizedDocument.length !== 14) {
      throw new BadRequestException(
        'Documento inválido: informe 11 dígitos (CPF) ou 14 dígitos (CNPJ).',
      );
    }

    const existing = await this.prisma.company.findUnique({
      where: {
        tenantId_document: {
          tenantId: principal.tenantId,
          document: normalizedDocument,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe uma empresa cadastrada com este CPF/CNPJ neste escritório.',
      );
    }

    const company = await this.prisma.company.create({
      data: {
        tenantId: principal.tenantId,
        legalName: dto.legalName.trim(),
        tradeName: dto.tradeName?.trim(),
        document: normalizedDocument,
        municipalReg: dto.municipalReg?.trim() || null,
        municipalityCode: dto.municipalityCode,
        taxRegime: dto.taxRegime?.trim(),
        simplesNacionalOpt: dto.simplesNacionalOpt,
        environment: dto.environment ?? 'HOMOLOGATION',
        defaultDpsSeries: dto.defaultDpsSeries?.trim() || '3',
      },
    });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'COMPANY_CREATED',
      resource: 'Company',
      resourceId: company.id,
      metadata: {
        document: company.document,
        municipalityCode: company.municipalityCode,
        environment: company.environment,
      },
      ipAddress,
    });

    return company;
  }

  async findAll(tenantId: string) {
    const companies = await this.prisma.company.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        certificates: {
          where: { isActive: true },
          select: {
            id: true,
            type: true,
            subjectDocument: true,
            expiresAt: true,
            status: true,
            lastValidatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return companies.map(({ certificates, ...company }) => ({
      ...company,
      activeCertificate: certificates[0] ?? null,
    }));
  }

  async findOne(tenantId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId },
      include: {
        certificates: {
          select: {
            id: true,
            type: true,
            subjectName: true,
            subjectDocument: true,
            issuerName: true,
            serialNumber: true,
            fingerprint: true,
            validFrom: true,
            expiresAt: true,
            status: true,
            isActive: true,
            lastValidatedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada neste escritório.');
    }
    return company;
  }

  async update(
    principal: AuthenticatedPrincipal,
    companyId: string,
    dto: UpdateCompanyDto,
    ipAddress?: string,
  ) {
    const existing = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId: principal.tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Empresa não encontrada neste escritório.');
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(dto.legalName ? { legalName: dto.legalName.trim() } : {}),
        ...(dto.tradeName !== undefined
          ? { tradeName: dto.tradeName.trim() }
          : {}),
        ...(dto.municipalReg !== undefined
          ? { municipalReg: dto.municipalReg.trim() || null }
          : {}),
        ...(dto.municipalityCode
          ? { municipalityCode: dto.municipalityCode }
          : {}),
        ...(dto.taxRegime !== undefined
          ? { taxRegime: dto.taxRegime.trim() || null }
          : {}),
        ...(dto.simplesNacionalOpt !== undefined
          ? { simplesNacionalOpt: dto.simplesNacionalOpt }
          : {}),
        ...(dto.defaultDpsSeries
          ? { defaultDpsSeries: dto.defaultDpsSeries.trim() }
          : {}),
        ...(dto.environment ? { environment: dto.environment } : {}),
      },
    });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'COMPANY_UPDATED',
      resource: 'Company',
      resourceId: companyId,
      metadata: { fields: Object.keys(dto) },
      ipAddress,
    });

    return updated;
  }
}

