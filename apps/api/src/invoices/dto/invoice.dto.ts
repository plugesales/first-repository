import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InvoiceCustomerAddressDto {
  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  cityCode?: string;
}

export class InvoiceCustomerDto {
  @IsString()
  @Matches(/^(\d{11}|\d{14}|[\d./-]+)$/)
  document: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceCustomerAddressDto)
  address?: InvoiceCustomerAddressDto;
}

class InvoiceServiceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deductions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unconditionalDiscount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  conditionalDiscount?: number;

  @IsOptional()
  @IsBoolean()
  issWithheld?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  issRate?: number;
}

export class CreateInvoiceDto {
  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsString()
  @Matches(/^\d{7}$/)
  municipalityCode: string;

  @IsString()
  @MinLength(4)
  @MaxLength(10)
  serviceCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  municipalTaxCode?: string;

  @IsDateString()
  competenceDate: string;

  @ValidateNested()
  @Type(() => InvoiceCustomerDto)
  customer: InvoiceCustomerDto;

  @ValidateNested()
  @Type(() => InvoiceServiceDto)
  service: InvoiceServiceDto;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey: string;
}

export class CancelInvoiceDto {
  @IsString()
  @Matches(/^(1|2|9)$/, {
    message: 'reasonCode deve ser 1 (Erro na Emissão), 2 (Serviço não Prestado) ou 9 (Outros).',
  })
  reasonCode: string;

  @IsString()
  @MinLength(15)
  @MaxLength(255)
  reason: string;
}

export class QuickIssueDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  companyDocument?: string;

  @ValidateNested()
  @Type(() => InvoiceCustomerDto)
  customer: InvoiceCustomerDto;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  serviceCode?: string;

  @IsOptional()
  @IsString()
  municipalTaxCode?: string;

  @IsOptional()
  @IsDateString()
  competenceDate?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  callbackUrl?: string;
}

