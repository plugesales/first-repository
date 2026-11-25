# IMPLEMENTAÇÃO — NFS-e HUB
## Fase 01: Fundação do SaaS Multiempresa

Você é o engenheiro de software responsável pela construção de uma plataforma SaaS profissional para emissão de NFS-e, com arquitetura multi-tenant e integração com diferentes provedores fiscais brasileiros.

### OBJETIVO

Construir a fundação de um sistema chamado NFS-e Hub.

Stack obrigatória:
- Frontend: React + Vite + TypeScript.
- Backend: NestJS + TypeScript.
- Banco: PostgreSQL.
- ORM: Prisma.
- Autenticação: JWT com controle de acesso multi-tenant.
- Filas: Redis + BullMQ.
- Infraestrutura preparada para Docker e EasyPanel.

### 1. ARQUITETURA

Criar estrutura organizada em monorepo:

- apps/web
- apps/api
- packages/nfse-types
- packages/fiscal-core
- packages/xml-engine
- packages/municipality-registry
- services/worker
- services/national-sefin
- services/nota-control-df
- services/abrasf
- docs

Não implementar regras fiscais diretamente nos componentes React.

### 2. MULTI-TENANCY

Implementar:
- Cadastro de clientes SaaS.
- Cadastro de usuários.
- Associação de usuários aos tenants.
- Cadastro de empresas e filiais.
- Isolamento obrigatório dos registros.
- Controle de permissões.
- Auditoria de operações.

Nenhuma empresa poderá acessar dados de outro tenant.

### 3. BANCO DE DADOS

Criar schema Prisma inicial para:
- tenants
- users
- companies
- certificates
- municipalities
- customers
- service_catalog
- tax_parameters
- dps
- invoices
- invoice_events
- transmissions
- audit_logs

Preparar controle de numeração DPS, idempotência e versionamento de parâmetros tributários.

### 4. INTERFACE

Criar painel administrativo profissional.

Identidade visual:
- Fundo grafite.
- Branco.
- Laranja #F76415.
- Tipografia moderna.
- Interface minimalista.
- Componentes consistentes.
- Responsividade.

Criar páginas:
- Dashboard.
- Empresas.
- Clientes.
- Emissão NFS-e.
- Notas fiscais.
- Serviços.
- Certificados digitais.
- Municípios e integrações.
- Relatórios.
- Configurações.

### 5. SEGURANÇA

- Não expor certificados no frontend.
- Não armazenar senhas de certificados em texto puro.
- Preparar armazenamento criptografado.
- Criar RBAC.
- Implementar validação de tenant no backend.
- Preparar políticas de isolamento no PostgreSQL.
- Não registrar senhas, chaves privadas ou XML sensível em logs.

### 6. CONECTORES FISCAIS

Criar interfaces abstratas para:
- NationalSefinProvider.
- NotaControlDfProvider.
- AbrasfProvider.

Criar registro de provedores e roteamento por código IBGE, modalidade de autorização e ambiente.

Não simular emissão fiscal e não inventar respostas de Webservices.

### 7. REGRAS IMPORTANTES

- O motor fiscal deve ser independente do frontend.
- O XML autorizado será preservado integralmente.
- Toda emissão terá rastreabilidade.
- Timeout não significa rejeição.
- Nunca repetir uma transmissão sem consultar o estado anterior.
- Certificados pertencem individualmente a cada prestador.
- A versão dos XSD e dos leiautes deve ser controlada.

### 8. ENTREGA DA FASE 01

Entregar:
1. Projeto inicial funcional.
2. Frontend navegável.
3. Backend iniciado.
4. Banco de dados e migrations.
5. Autenticação.
6. Multi-tenancy.
7. Cadastro de empresas.
8. Cadastro de municípios.
9. Estrutura dos conectores.
10. Documentação de instalação e execução.

IMPORTANTE:
Não destruir funcionalidades existentes caso o projeto seja iniciado sobre um repositório preexistente. Inspecionar a estrutura antes de qualquer alteração.

Não implementar telas fictícias que aparentem emitir notas reais. Integrações ainda não implementadas devem ser identificadas como pendentes.

Priorizar código modular, seguro, testável e preparado para evolução.