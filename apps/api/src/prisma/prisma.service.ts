import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('Conexão com PostgreSQL estabelecida.');
    } catch (error) {
      this.connected = false;
      this.logger.warn(
        `PostgreSQL indisponível na inicialização (${error instanceof Error ? error.message : 'erro desconhecido'}). Verifique DATABASE_URL.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.$disconnect();
    }
  }

  async checkConnection(): Promise<'connected' | 'disconnected'> {
    try {
      await this.$queryRaw`SELECT 1`;
      this.connected = true;
      return 'connected';
    } catch {
      this.connected = false;
      return 'disconnected';
    }
  }
}

