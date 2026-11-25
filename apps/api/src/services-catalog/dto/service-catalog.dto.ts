import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServiceCatalogDto {
  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  internalCode?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(10)
  nationalTaxCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  municipalTaxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  nbsCode?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  defaultIssRate?: number;

  @IsOptional()
  @IsBoolean()
  issWithheldDefault?: boolean;
}

export class UpdateServiceCatalogDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  internalCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(10)
  nationalTaxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  municipalTaxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  nbsCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  defaultIssRate?: number;

  @IsOptional()
  @IsBoolean()
  issWithheldDefault?: boolean;
}

