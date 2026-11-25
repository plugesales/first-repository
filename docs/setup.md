# Instalação e Execução — NFS-e Hub

## 1. Pré-requisitos na Máquina de Teste (Windows / Local)
- Node.js >= 20 e npm >= 10
- PostgreSQL 16 (local ou instância de teste no Supabase)
- Redis 7 (opcional na Parte 1; obrigatório na Parte 3 para filas BullMQ)

## 2. Configuração Inicial (Máquina de Teste)
1. Copie `.env.example` para `.env` na raiz do repositório e preencha `DATABASE_URL`:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Instale as dependências do monorepo:
   ```powershell
   npm install
   ```
3. Gere o Prisma Client e rode as migrations quando o PostgreSQL estiver disponível:
   ```powershell
   npm run prisma:generate
   npm run prisma:migrate
   ```
4. Rode a API e o Frontend em terminais separados:
   ```powershell
   npm run dev:api
   npm run dev:web
   ```
   - API Healthcheck: `http://localhost:3001/api/v1/health`
   - Frontend: `http://localhost:5173`

## 3. Deploy na VPS (Docker / EasyPanel)
Na máquina VPS com Docker e Docker Compose instalados:
```bash
cp .env.example .env
# Configure senhas reais, CERT_MASTER_KEY (64 chars hex) e credenciais Supabase
docker compose -f infrastructure/docker/docker-compose.yml up -d --build
docker compose -f infrastructure/docker/docker-compose.yml exec api npm run prisma:migrate:deploy --workspace=@nfse-hub/api
```
Após a criação das tabelas, aplique as políticas de isolamento RLS conforme `apps/api/prisma/rls-policies.sql`.

