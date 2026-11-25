-- Políticas de Row-Level Security (RLS) para isolamento multi-tenant no PostgreSQL.
-- Aplicar após as migrations em produção/VPS quando a aplicação definir
-- `SET LOCAL app.current_tenant_id = '<uuid>'` por transação.

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Certificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceCatalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Dps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'Company', 'Certificate', 'Customer', 'ServiceCatalog',
    'Dps', 'Invoice', 'InvoiceEvent', 'Transmission',
    'OutboxEvent', 'AuditLog'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%s ON %I;', lower(tbl), tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%s ON %I USING ("tenantId" = current_setting(''app.current_tenant_id'', true));',
      lower(tbl),
      tbl
    );
  END LOOP;
END $$;

