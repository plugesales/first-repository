import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    principal: AuthenticatedPrincipal,
    dto: CreateCustomerDto,
    ipAddress?: string,
  ) {
    const normalizedDoc = dto.document.replace(/\D/g, '');
    if (normalizedDoc.length !== 11 && normalizedDoc.length !== 14) {
      throw new BadRequestException(
        'Documento inválido: informe CPF (11 dígitos) ou CNPJ (14 dígitos).',
      );
    }

    const existing = await this.prisma.customer.findUnique({
      where: {
        tenantId_document: {
          tenantId: principal.tenantId,
          document: normalizedDoc,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe um tomador cadastrado com este documento.',
      );
    }

    const customer = await this.prisma.customer.create({
      data: {
        tenantId: principal.tenantId,
        document: normalizedDoc,
        name: dto.name.trim(),
        email: dto.email?.trim(),
        phone: dto.phone?.replace(/\D/g, ''),
        zipCode: dto.zipCode?.replace(/\D/g, ''),
        street: dto.street?.trim(),
        number: dto.number?.trim(),
        district: dto.district?.trim(),
        cityCode: dto.cityCode,
      },
    });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'CUSTOMER_CREATED',
      resource: 'Customer',
      resourceId: customer.id,
      metadata: { document: customer.document },
      ipAddress,
    });

    return customer;
  }

  findAll(tenantId: string) {
    return this.prisma.customer.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Tomador não encontrado.');
    }
    return customer;
  }
}

