import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ALLOW_WITHOUT_TENANT_KEY = 'allowWithoutTenant';
export const AllowWithoutTenant = () =>
  SetMetadata(ALLOW_WITHOUT_TENANT_KEY, true);

