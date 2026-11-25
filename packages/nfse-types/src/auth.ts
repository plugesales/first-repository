export type TenantRole =
  | 'OWNER'
  | 'ADMIN'
  | 'ACCOUNTANT'
  | 'OPERATOR'
  | 'VIEWER';

export type AuthProviderKind = 'supabase' | 'local';

export interface AuthenticatedPrincipal {
  userId: string;
  externalAuthId: string | null;
  email: string;
  name: string;
  tenantId: string;
  role: TenantRole;
  authProvider: AuthProviderKind;
}

export interface AuthTokenClaims {
  sub: string;
  email?: string;
  role?: string;
  provider: AuthProviderKind;
}

