import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { calculateBasicNfseTotals } from '@nfse-hub/fiscal-core';
import type {
  AuthenticatedPrincipal,
  NfseEmissionInput,
} from '@nfse-hub/nfse-types';
import { generateDanfsePdf } from '@nfse-hub/xml-engine';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CancelInvoiceDto,
  CreateInvoiceDto,
  QuickIssueDto,
} from './dto/invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    principal: AuthenticatedPrincipal,
    dto: CreateInvoiceDto,
    ipAddress?: string,
  ) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: dto.companyId,
        tenantId: principal.tenantId,
      },
      include: {
        certificates: {
          where: {
            isActive: true,
            status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
          },
          take: 1,
        },
      },
    });

    if (!company) {
      throw new ForbiddenException('Empresa não autorizada neste escritório.');
    }

    const activeCert = company.certificates[0];
    if (!activeCert || activeCert.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'A empresa não possui certificado digital A1 ativo/válido para assinatura e mTLS.',
      );
    }

    const municipality = await this.prisma.municipality.findUnique({
      where: { ibgeCode: dto.municipalityCode },
    });

    if (!municipality || !municipality.active) {
      throw new BadRequestException(
        `Município IBGE ${dto.municipalityCode} ainda não está habilitado para emissão.`,
      );
    }

    const totals = calculateBasicNfseTotals({
      serviceAmount: dto.service.amount,
      unconditionalDiscount: dto.service.unconditionalDiscount,
      conditionalDiscount: dto.service.conditionalDiscount,
      deductions: dto.service.deductions,
      issRate: dto.service.issRate,
      issWithheld: dto.service.issWithheld,
    });

    const savedCustomer = dto.customerId
      ? await this.prisma.customer.findFirst({
          where: { id: dto.customerId, tenantId: principal.tenantId },
        })
      : null;

    const mergedAddress = dto.customer.address ?? (savedCustomer
      ? {
          zipCode: savedCustomer.zipCode ?? undefined,
          street: savedCustomer.street ?? undefined,
          number: savedCustomer.number ?? undefined,
          district: savedCustomer.district ?? undefined,
          cityCode: savedCustomer.cityCode ?? undefined,
        }
      : undefined);

    const catalogNbs = !dto.nbsCode
      ? await this.prisma.serviceCatalog.findFirst({
          where: {
            tenantId: principal.tenantId,
            companyId: company.id,
            nationalTaxCode: dto.serviceCode,
          },
          select: { nbsCode: true },
        })
      : null;

    const emissionPayload: NfseEmissionInput = {
      companyId: company.id,
      customerId: dto.customerId,
      municipalityCode: dto.municipalityCode,
      serviceCode: dto.serviceCode,
      municipalTaxCode: dto.municipalTaxCode?.trim() || undefined,
      nbsCode: dto.nbsCode?.trim() || catalogNbs?.nbsCode?.trim() || undefined,
      competenceDate: dto.competenceDate,
      customer: {
        ...dto.customer,
        document: dto.customer.document.replace(/\D/g, ''),
        ...(mergedAddress ? { address: mergedAddress } : {}),
      },
      service: dto.service,
      idempotencyKey: dto.idempotencyKey,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: principal.tenantId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });

      if (existing) {
        return { invoice: existing, deduplicated: true };
      }

      const created = await tx.invoice.create({
        data: {
          tenantId: principal.tenantId,
          companyId: company.id,
          customerId: dto.customerId,
          idempotencyKey: dto.idempotencyKey,
          providerCode: municipality.providerCode,
          environment: company.environment,
          status: 'QUEUED',
          competenceDate: new Date(dto.competenceDate),
          amount: dto.service.amount,
          netAmount: totals.netAmount,
          payload: emissionPayload as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: principal.tenantId,
          aggregate: 'Invoice',
          aggregateId: created.id,
          eventType: 'INVOICE_EMISSION_REQUESTED',
          payload: {
            tenantId: principal.tenantId,
            invoiceId: created.id,
          } as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      return { invoice: created, deduplicated: false };
    });

    if (!result.deduplicated) {
      await this.audit.record({
        tenantId: principal.tenantId,
        userId: principal.userId,
        action: 'INVOICE_QUEUED',
        resource: 'Invoice',
        resourceId: result.invoice.id,
        metadata: {
          companyId: company.id,
          providerCode: municipality.providerCode,
          municipalityCode: dto.municipalityCode,
          amount: dto.service.amount,
        },
        ipAddress,
      });
    }

    return result.invoice;
  }

  async quickIssue(
    principal: AuthenticatedPrincipal,
    dto: QuickIssueDto,
    ipAddress?: string,
  ) {
    let company = null;
    if (dto.companyId) {
      company = await this.prisma.company.findFirst({
        where: { id: dto.companyId, tenantId: principal.tenantId },
        include: { services: true },
      });
    } else if (dto.companyDocument) {
      const cleanCompDoc = dto.companyDocument.replace(/\D/g, '');
      company = await this.prisma.company.findFirst({
        where: { document: cleanCompDoc, tenantId: principal.tenantId },
        include: { services: true },
      });
    } else {
      company = await this.prisma.company.findFirst({
        where: {
          tenantId: principal.tenantId,
          isActive: true,
          certificates: {
            some: {
              isActive: true,
              status: { in: ['ACTIVE', 'EXPIRING_SOON'] },
            },
          },
        },
        include: { services: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!company) {
        company = await this.prisma.company.findFirst({
          where: { tenantId: principal.tenantId, isActive: true },
          include: { services: true },
          orderBy: { createdAt: 'asc' },
        });
      }
    }

    if (!company) {
      throw new BadRequestException(
        'Nenhuma empresa emissora ativa encontrada para este tenant.',
      );
    }

    const cleanCustDoc = dto.customer.document.replace(/\D/g, '');
    let customer = await this.prisma.customer.findFirst({
      where: { tenantId: principal.tenantId, document: cleanCustDoc },
    });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          tenantId: principal.tenantId,
          document: cleanCustDoc,
          name: dto.customer.name,
          email: dto.customer.email,
          zipCode: dto.customer.address?.zipCode,
          street: dto.customer.address?.street,
          number: dto.customer.address?.number,
          district: dto.customer.address?.district,
          cityCode: dto.customer.address?.cityCode,
        },
      });
    } else if (dto.customer.address) {
      customer = await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          name: dto.customer.name || customer.name,
          email: dto.customer.email || customer.email,
          zipCode: dto.customer.address.zipCode || customer.zipCode,
          street: dto.customer.address.street || customer.street,
          number: dto.customer.address.number || customer.number,
          district: dto.customer.address.district || customer.district,
          cityCode: dto.customer.address.cityCode || customer.cityCode,
        },
      });
    }

    const serviceCatalogItem = dto.serviceCode
      ? company.services.find((s) => s.nationalTaxCode === dto.serviceCode)
      : company.services[0];

    const serviceCode =
      dto.serviceCode || serviceCatalogItem?.nationalTaxCode || '170601';
    const description =
      dto.description ||
      serviceCatalogItem?.description ||
      'PRESTACAO DE SERVICOS';
    const issRate = serviceCatalogItem?.defaultIssRate
      ? Number(serviceCatalogItem.defaultIssRate)
      : 5;
    const municipalTaxCode =
      dto.municipalTaxCode ?? serviceCatalogItem?.municipalTaxCode ?? undefined;
    const nbsCode =
      dto.nbsCode ?? serviceCatalogItem?.nbsCode ?? undefined;

    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const competenceDate = dto.competenceDate || localToday;
    const idempotencyKey =
      dto.idempotencyKey ||
      `quick_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const createDto: CreateInvoiceDto = {
      companyId: company.id,
      customerId: customer.id,
      municipalityCode: company.municipalityCode,
      serviceCode,
      municipalTaxCode,
      nbsCode,
      competenceDate,
      customer: {
        document: cleanCustDoc,
        name: customer.name,
        email: customer.email ?? undefined,
        address: dto.customer.address ?? (customer.street ? {
          street: customer.street ?? undefined,
          number: customer.number ?? undefined,
          district: customer.district ?? undefined,
          cityCode: customer.cityCode ?? undefined,
          zipCode: customer.zipCode ?? undefined,
        } : undefined),
      },
      service: {
        amount: dto.amount,
        description,
        issRate,
      },
      idempotencyKey,
    };

    const invoice = await this.create(principal, createDto, ipAddress);

    return {
      success: true,
      invoiceId: invoice.id,
      status: invoice.status,
      idempotencyKey,
      company: {
        id: company.id,
        name: company.legalName,
        document: company.document,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        document: customer.document,
      },
      amount: dto.amount,
      trackingUrl: `/api/v1/invoices/${invoice.id}`,
      pdfUrl: `/api/v1/invoices/${invoice.id}/pdf`,
      xmlUrl: `/api/v1/invoices/${invoice.id}/xml`,
    };
  }

  findAll(
    tenantId: string,
    filters: { companyId?: string; status?: string },
  ) {
    return this.prisma.invoice.findMany({
      where: {
        tenantId,
        ...(filters.companyId ? { companyId: filters.companyId } : {}),
        ...(filters.status
          ? { status: filters.status as Prisma.EnumInvoiceStatusFilter }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        events: { orderBy: { createdAt: 'desc' } },
        transmissions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Nota fiscal não encontrada.');
    }
    return invoice;
  }

  async getAuthorizedXml(tenantId: string, invoiceId: string): Promise<string> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { authorizedXml: true, status: true },
    });
    if (!invoice) {
      throw new NotFoundException('Nota fiscal não encontrada.');
    }
    if (!invoice.authorizedXml) {
      throw new BadRequestException(
        `XML autorizado indisponível (status atual: ${invoice.status}).`,
      );
    }
    return invoice.authorizedXml;
  }

  async getDanfsePdf(tenantId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        company: { select: { legalName: true, document: true } },
        customer: { select: { name: true, document: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Nota fiscal não encontrada.');
    }
    if (!invoice.authorizedXml) {
      throw new BadRequestException(
        `DANFSe PDF indisponível enquanto a nota não possuir XML autorizado (status: ${invoice.status}).`,
      );
    }

    const payload = invoice.payload as Partial<NfseEmissionInput>;
    return generateDanfsePdf({
      authorizedXml: invoice.authorizedXml,
      fallback: {
        invoiceNumber: invoice.invoiceNumber,
        accessKey: invoice.accessKey,
        companyName: invoice.company.legalName,
        companyDocument: invoice.company.document,
        customerName: invoice.customer?.name ?? payload.customer?.name,
        customerDocument:
          invoice.customer?.document ?? payload.customer?.document,
        serviceDescription: payload.service?.description,
        amount: Number(invoice.amount),
        netAmount: invoice.netAmount ? Number(invoice.netAmount) : null,
        competenceDate: invoice.competenceDate.toISOString().slice(0, 10),
      },
    });
  }

  async requestCancel(
    principal: AuthenticatedPrincipal,
    invoiceId: string,
    dto: CancelInvoiceDto,
    ipAddress?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: principal.tenantId },
    });

    if (!invoice) {
      throw new NotFoundException('Nota fiscal não encontrada.');
    }
    if (invoice.status !== 'AUTHORIZED' || !invoice.accessKey) {
      throw new BadRequestException(
        'Somente notas autorizadas com chave de acesso podem ser canceladas.',
      );
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const createdEvent = await tx.invoiceEvent.create({
        data: {
          tenantId: principal.tenantId,
          invoiceId: invoice.id,
          eventType: 'e101101',
          status: 'QUEUED',
        },
      });

      await tx.outboxEvent.create({
        data: {
          tenantId: principal.tenantId,
          aggregate: 'InvoiceEvent',
          aggregateId: createdEvent.id,
          eventType: 'INVOICE_CANCEL_REQUESTED',
          payload: {
            tenantId: principal.tenantId,
            invoiceId: invoice.id,
            eventId: createdEvent.id,
            reasonCode: dto.reasonCode,
            reason: dto.reason,
          } as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      return createdEvent;
    });

    await this.audit.record({
      tenantId: principal.tenantId,
      userId: principal.userId,
      action: 'INVOICE_CANCEL_REQUESTED',
      resource: 'Invoice',
      resourceId: invoice.id,
      metadata: { reasonCode: dto.reasonCode },
      ipAddress,
    });

    return event;
  }
}

