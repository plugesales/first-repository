import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CertificatesModule } from './certificates/certificates.module';
import { CompaniesModule } from './companies/companies.module';
import { validateEnv } from './config/env';
import { CustomersModule } from './customers/customers.module';
import { HealthController } from './health/health.controller';
import { InvoicesModule } from './invoices/invoices.module';
import { MunicipalitiesModule } from './municipalities/municipalities.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { ServicesCatalogModule } from './services-catalog/services-catalog.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CompaniesModule,
    CertificatesModule,
    CustomersModule,
    ServicesCatalogModule,
    MunicipalitiesModule,
    InvoicesModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
