import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedPrincipal } from '@nfse-hub/nfse-types';
import type { Request } from 'express';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CertificatesService } from './certificates.service';
import { UploadCertificateDto } from './dto/upload-certificate.dto';

const MAX_PFX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

@Controller()
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('companies/:companyId/certificate')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PFX_SIZE_BYTES },
    }),
  )
  uploadA1(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('companyId') companyId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadCertificateDto,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Envie o arquivo do certificado A1 (.pfx ou .p12) no campo "file".',
      );
    }

    return this.certificatesService.uploadA1({
      principal,
      companyId,
      pfxBuffer: file.buffer,
      password: dto.password,
      ipAddress: req.ip,
    });
  }

  @Get('companies/:companyId/certificates')
  listByCompany(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('companyId') companyId: string,
  ) {
    return this.certificatesService.listByCompany(principal.tenantId, companyId);
  }

  @Get('certificates')
  listByTenant(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.certificatesService.listByTenant(principal.tenantId);
  }

  @Post('certificates/:id/verify')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'OPERATOR')
  verify(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.certificatesService.verifyStoredCertificate(
      principal,
      id,
      req.ip,
    );
  }

  @Delete('certificates/:id')
  @Roles('OWNER', 'ADMIN')
  revoke(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.certificatesService.revoke(principal, id, req.ip);
  }
}

