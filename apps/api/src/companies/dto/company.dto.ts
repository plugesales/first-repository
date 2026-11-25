import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeName?: string;

  @IsString()
  @Matches(/^(\d{11}|\d{14}|[\d./-]+)$/, {
    message: 'Documento deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos).',
  })
  document: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  municipalReg?: string;

  @IsString()
  @Matches(/^\d{7}$/, {
    message: 'municipalityCode deve conter os 7 dígitos do código IBGE.',
  })
  municipalityCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxRegime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  simplesNacionalOpt?: number;

  @IsOptional()
  @IsEnum(['HOMOLOGATION', 'PRODUCTION'])
  environment?: 'HOMOLOGATION' | 'PRODUCTION';

  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultDpsSeries?: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  municipalReg?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/)
  municipalityCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxRegime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  simplesNacionalOpt?: number;

  @IsOptional()
  @IsEnum(['HOMOLOGATION', 'PRODUCTION'])
  environment?: 'HOMOLOGATION' | 'PRODUCTION';

  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultDpsSeries?: string;
}

