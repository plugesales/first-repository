import { Module } from '@nestjs/common';
import { CertificateCryptoService } from './certificate-crypto.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { PfxInspectorService } from './pfx-inspector.service';

@Module({
  controllers: [CertificatesController],
  providers: [
    CertificateCryptoService,
    PfxInspectorService,
    CertificatesService,
  ],
  exports: [CertificatesService, CertificateCryptoService],
})
export class CertificatesModule {}

