import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpsertMunicipalityDto {
  @IsString()
  @Matches(/^\d{7}$/, { message: 'ibgeCode deve ter exatamente 7 dígitos.' })
  ibgeCode: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'state deve ser UF com 2 letras maiúsculas.' })
  state: string;

  @IsEnum(['NATIONAL_SEFIN', 'NOTA_CONTROL_DF', 'ABRASF'])
  providerCode: 'NATIONAL_SEFIN' | 'NOTA_CONTROL_DF' | 'ABRASF';

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  authorizationMode: string;

  @IsOptional()
  @IsEnum(['1.00', '1.01'])
  layoutVersion?: '1.00' | '1.01';

  @IsOptional()
  @IsUrl()
  homologationUrl?: string;

  @IsOptional()
  @IsUrl()
  productionUrl?: string;

  @IsOptional()
  @IsEnum(['HOMOLOGATION', 'PRODUCTION'])
  environment?: 'HOMOLOGATION' | 'PRODUCTION';

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

