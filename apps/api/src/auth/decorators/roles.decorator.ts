import { SetMetadata } from '@nestjs/common';
import type { TenantRole } from '@nfse-hub/nfse-types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: TenantRole[]) => SetMetadata(ROLES_KEY, roles);

