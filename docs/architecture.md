# Arquitetura — NFS-e Hub

## Visão Geral
Plataforma SaaS multi-tenant para contabilidades gerenciarem empresas, certificados digitais A1 e emissão/consulta de NFS-e em múltiplos municípios.

## Decisões da Parte 1
- **Monorepo npm workspaces**: separa `apps/web`, `apps/api`, `packages/*` e `services/*` garantindo que regras fiscais e assinaturas XML fiquem fora do frontend.
- **Autenticação Desacoplada**: inicialmente via Supabase Auth (`externalAuthId` + `authProvider` na tabela `User`), com interface preparada para migração futura para JWT próprio.
- **Cofre de Certificados A1 no PostgreSQL**: `.pfx` e senha armazenados criptografados com AES-256-GCM (`encryptedPfx`, `pfxIv`, `pfxAuthTag`, `encryptedPassword`, `passwordIv`, `passwordAuthTag`), descriptografados exclusivamente em memória no backend/worker para mTLS e XMLDSig.
- **Idempotência e Outbox**: índice único `(tenantId, idempotencyKey)` em `Invoice` + tabela `OutboxEvent` e `DpsSequence` transacional por `(companyId, series)`.

