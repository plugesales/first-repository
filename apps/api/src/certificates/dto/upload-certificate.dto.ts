import { IsString, MinLength } from 'class-validator';

export class UploadCertificateDto {
  @IsString()
  @MinLength(1, { message: 'A senha do certificado A1 é obrigatória.' })
  password: string;
}

