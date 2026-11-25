import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class OnboardingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  tenantName: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  tenantDocument?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  userName: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

