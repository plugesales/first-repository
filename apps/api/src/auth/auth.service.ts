import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthenticatedPrincipal,
  AuthTokenClaims,
  TenantRole,
} from '@nfse-hub/nfse-types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OnboardingDto } from './dto/onboarding.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async resolvePrincipal(
    claims: AuthTokenClaims,
    requestedTenantId?: string,
  ): Promise<AuthenticatedPrincipal> {
    const user = await this.prisma.user.findFirst({
      where:
        claims.provider === 'supabase'
          ? {
              OR: [
                { externalAuthId: claims.sub },
                ...(claims.email ? [{ email: claims.email }] : []),
              ],
            }
          : { id: claims.sub },
      include: {
        memberships: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Usuário ainda não provisionado no NFS-e Hub. Conclua o onboarding do escritório.',
      );
    }

    // Se localizou pelo e-mail no primeiro login Supabase, vincula externalAuthId
    if (
      claims.provider === 'supabase' &&
      !user.externalAuthId &&
      claims.sub
    ) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { externalAuthId: claims.sub },
      });
    }

    if (user.memberships.length === 0) {
      throw new ForbiddenException(
        'Usuário sem vínculo com nenhum tenant ativo.',
      );
    }

    const membership = requestedTenantId
      ? user.memberships.find((m) => m.tenantId === requestedTenantId)
      : user.memberships[0];

    if (!membership) {
      throw new ForbiddenException(
        'Acesso negado ao tenant solicitado.',
      );
    }

    return {
      userId: user.id,
      externalAuthId: user.externalAuthId,
      email: user.email,
      name: user.name,
      tenantId: membership.tenantId,
      role: membership.role as TenantRole,
      authProvider: claims.provider,
    };
  }

  async resolveApiKeyPrincipal(
    apiKey: string,
    requestedTenantId?: string,
  ): Promise<AuthenticatedPrincipal> {
    const configuredKey = process.env.API_INTEGRATION_KEY?.trim();
    if (!configuredKey || apiKey !== configuredKey) {
      throw new UnauthorizedException(
        'Chave de API (x-api-key) inválida ou não configurada.',
      );
    }

    const tenant = requestedTenantId
      ? await this.prisma.tenant.findUnique({ where: { id: requestedTenantId } })
      : await this.prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });

    if (!tenant) {
      throw new ForbiddenException(
        'Nenhum escritório (tenant) cadastrado no sistema.',
      );
    }

    const membership = await this.prisma.userTenant.findFirst({
      where: {
        tenantId: tenant.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
      include: { user: true },
    });

    return {
      userId: membership?.user.id || 'system-api-key',
      externalAuthId: membership?.user.externalAuthId ?? null,
      email: membership?.user.email || 'api@nfse-hub.local',
      name: membership?.user.name || 'Integração Externa (n8n / WhatsApp)',
      tenantId: tenant.id,
      role: (membership?.role as TenantRole) || 'ADMIN',
      authProvider: 'local',
    };
  }

  async onboardTenant(
    claims: AuthTokenClaims,
    dto: OnboardingDto,
    ipAddress?: string,
  ): Promise<AuthenticatedPrincipal> {
    const email = claims.email ?? dto.email;
    if (!email) {
      throw new UnauthorizedException(
        'E-mail obrigatório para concluir o onboarding.',
      );
    }

    const normalizedDoc = dto.tenantDocument
      ? dto.tenantDocument.replace(/\D/g, '')
      : undefined;

    if (normalizedDoc) {
      const existingTenant = await this.prisma.tenant.findUnique({
        where: { document: normalizedDoc },
      });
      if (existingTenant) {
        throw new ConflictException(
          'Já existe um escritório cadastrado com este CNPJ/CPF.',
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findFirst({
        where: {
          OR: [{ externalAuthId: claims.sub }, { email }],
        },
        include: { memberships: true },
      });

      if (existingUser && existingUser.memberships.length > 0) {
        throw new ConflictException(
          'Usuário já possui escritório vinculado.',
        );
      }

      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName.trim(),
          document: normalizedDoc,
          plan: 'starter',
          status: 'ACTIVE',
        },
      });

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              externalAuthId: claims.sub,
              name: dto.userName.trim(),
            },
          })
        : await tx.user.create({
            data: {
              email,
              name: dto.userName.trim(),
              externalAuthId:
                claims.provider === 'supabase' ? claims.sub : undefined,
              authProvider:
                claims.provider === 'supabase' ? 'SUPABASE' : 'LOCAL',
            },
          });

      const membership = await tx.userTenant.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'OWNER',
          isDefault: true,
        },
      });

      return { tenant, user, membership };
    });

    await this.audit.record({
      tenantId: result.tenant.id,
      userId: result.user.id,
      action: 'TENANT_ONBOARDED',
      resource: 'Tenant',
      resourceId: result.tenant.id,
      metadata: {
        tenantName: result.tenant.name,
        authProvider: claims.provider,
      },
      ipAddress,
    });

    return {
      userId: result.user.id,
      externalAuthId: result.user.externalAuthId,
      email: result.user.email,
      name: result.user.name,
      tenantId: result.tenant.id,
      role: result.membership.role as TenantRole,
      authProvider: claims.provider,
    };
  }
}

