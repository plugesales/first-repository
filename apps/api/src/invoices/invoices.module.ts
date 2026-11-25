import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  controllers: [InvoicesController, WebhooksController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}

