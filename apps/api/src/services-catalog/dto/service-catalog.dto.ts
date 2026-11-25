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

  @IsString()
  @MinLength(2)
  @MaxLength(15)
  municipalTaxCode: string;

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

