# Guia de Deploy no Easypanel (VPS) via GitHub

Este guia orienta o deploy completo do **NFS-e Hub** em sua VPS utilizando o **Easypanel** e integração contínua via **GitHub**.

---

## 1. Subindo o Código para o GitHub

1. Crie um novo repositório no seu GitHub (recomendado: **Privado**):
   - Nome sugerido: `nfse-hub`
   - Não inicialize com README ou .gitignore (já temos tudo configurado).

2. No terminal do seu computador (na pasta do projeto `C:\Users\Kaoz\Documents\Contabilidade`):
   ```bash
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/nfse-hub.git
   git add .
   git commit -m "feat: nfse-hub cloud deploy with easypanel, webhook and api key"
   git push -u origin main
   ```

---

## 2. Criando o Projeto no Easypanel

1. Acesse o painel do **Easypanel** em seu navegador (`https://seu-easypanel-ip:3000` ou domínio).
2. Clique em **Create Project** (ou selecione um projeto existente) e nomeie como `nfse-hub`.
3. Dentro do projeto, clique em **+ Service** e selecione o tipo **Compose** (Docker Compose).

---

## 3. Configurando o Serviço Compose no Easypanel

1. **Source (Origem):**
   - Selecione **GitHub**.
   - Conecte sua conta do GitHub ou insira a URL do repositório: `https://github.com/SEU_USUARIO/nfse-hub`.
   - **Branch:** `main`
   - **Compose File Path:** `docker-compose.yml`

2. **Environment Variables (Variáveis de Ambiente):**
   No painel do serviço no Easypanel, vá na aba **Environment** e cole as variáveis de produção (copie do seu `.env` local ou preencha os valores reais):

   ```env
   NODE_ENV=production
   PORT=3001
   WORKER_MODE=bullmq

   # Banco de Dados (Use a URL do seu Supabase ou PostgreSQL da VPS)
   DATABASE_URL=postgresql://postgres:postgres@postgres:5432/nfse_hub?schema=public

   # Redis para filas e resiliência
   REDIS_HOST=redis
   REDIS_PORT=6379

   # Chave Mestra do Cofre de Certificados A1 (Mesma do seu .env)
   CERT_MASTER_KEY=coloque_sua_cert_master_key_de_64_caracteres_aqui

   # Chave de Integração para n8n e Webhooks do WhatsApp
   API_INTEGRATION_KEY=sua_chave_secreta_para_o_n8n

   # URL do Webhook do n8n para receber notificações de notas emitidas
   N8N_WEBHOOK_URL=https://seu-n8n.seudominio.com/webhook/nfse-callback

   # Supabase Auth
   AUTH_PROVIDER=supabase
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_ANON_KEY=sua_anon_key
   SUPABASE_JWT_SECRET=seu_jwt_secret

   CORS_ORIGIN=*
   ```

3. **Domínios e SSL Automático:**
   Na aba **Domains** do Easypanel:
   - Para o painel web: aponte `nfse.seudominio.com` para a porta `80` do serviço `web`. O Easypanel gerará o certificado SSL (HTTPS) Let's Encrypt automaticamente.
   - Como o `web` possui proxy reverso embutido para `/api/`, todas as chamadas de API e Webhooks funcionarão sob o mesmo domínio: `https://nfse.seudominio.com/api/v1/...`.

4. **Deploy:**
   - Clique em **Deploy**. O Easypanel fará o clone do repositório, criará as imagens Docker de produção e iniciará os containers:
     - `nfse-hub-postgres` (banco de dados interno)
     - `nfse-hub-redis` (gestor de filas BullMQ)
     - `nfse-hub-api` (API NestJS com migrations automáticas)
     - `nfse-hub-worker` (assinador A1 e transmissor mTLS 24/7)
     - `nfse-hub-web` (dashboard React com Nginx)

---

## 4. Testando a API em Produção

Após o deploy concluir com sucesso, teste o endpoint de saúde:
```bash
curl https://nfse.seudominio.com/api/v1/health
```

E teste uma emissão direta via API Key:
```bash
curl -X POST https://nfse.seudominio.com/api/v1/webhooks/issue \
  -H "Content-Type: application/json" \
  -H "x-api-key: sua_chave_secreta_para_o_n8n" \
  -d '{"customer":{"document":"56950767000136","name":"VIP SOLUCOES LTDA"},"amount":1.00,"description":"TESTE PRODUCAO CLOUD"}'
```
