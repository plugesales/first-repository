import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

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

  async update(
    principal: AuthenticatedPrincipal,
    id: string,
    dto: UpdateCustomerDto,
    ipAddress?: string,
  ) {
    const existing = await this.findOne(principal.tenantId, id);

    let normalizedDoc: string | undefined;
    if (dto.document !== undefined) {
      normalizedDoc = dto.document.replace(/\D/g, '');
      if (normalizedDoc.length !== 11 && normalizedDoc.length !== 14) {
        throw new BadRequestException(
          'Documento inválido: informe CPF (11 dígitos) ou CNPJ (14 dígitos).',
        );
      }
      if (normalizedDoc !== existing.document) {
        const dup = await this.prisma.customer.findUnique({
          where: {
            tenantId_document: {
              tenantId: principal.tenantId,
              document: normalizedDoc,
            },
          },
        });
        if (dup) {
          throw new ConflictException(
            'Já existe outro tomador cadastrado com este documento.',
          );
        }
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(normalizedDoc ? { document: normalizedDoc } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim() || null } : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone.replace(/\D/g, '') || null }
          : {}),
        ...(dto.zipCode !== undefined
          ? { zipCode: dto.zipCode.replace(/\D/g, '') || null }
          : {}),
        ...(dto.street !== undefined
          ? { street: dto.street.trim() || null }
          : {}),
        ...(dto.number !== undefined
          ? { number: dto.number.trim() || null }
          : {}),
        ...(dto.district !== undefined
          ? { district: dto.district.trim() || null }
          : {}),
        ...(dto.cityCode !== undefined ? { cityCode: dto.cityCode || null } : {}),
      },
    });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'CUSTOMER_UPDATED',
      resource: 'Customer',
      resourceId: id,
      metadata: { document: updated.document },
      ipAddress,
    });

    return updated;
  }

  async remove(
    principal: AuthenticatedPrincipal,
    id: string,
    ipAddress?: string,
  ) {
    await this.findOne(principal.tenantId, id);
    await this.prisma.customer.delete({ where: { id } });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'CUSTOMER_DELETED',
      resource: 'Customer',
      resourceId: id,
      ipAddress,
    });

    return { deleted: true, id };
  }
}

