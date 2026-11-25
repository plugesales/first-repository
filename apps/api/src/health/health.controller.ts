import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import type { AppEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Public()
  @Get()
  async check() {
    const database = await this.prisma.checkConnection();
    return {
      status: database === 'connected' ? 'ok' : 'degraded',
      service: 'nfse-hub-api',
      environment: this.config.get('APP_ENV', { infer: true }),
      authProvider: this.config.get('AUTH_PROVIDER', { infer: true }),
      database,
      timestamp: new Date().toISOString(),
    };
  }
}

