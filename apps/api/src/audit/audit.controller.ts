import { Controller, Get, Query } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('limit') limitRaw?: string,
  ) {
    const parsed = Number(limitRaw ?? 50);
    const take = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), 200)
      : 50;

    return this.prisma.auditLog.findMany({
      where: { tenantId: principal.tenantId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }
}

