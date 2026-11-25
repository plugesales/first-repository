Projeto: Emissor NFS-e Multiempresa — SaaS
Arquitetura definida
 React + TypeScript


Vamos construir uma plataforma SaaS de emissão de Notas Fiscais de Serviços Eletrônicas, na qual várias empresas poderão cadastrar seus dados fiscais, conectar seus certificados digitais, emitir notas, consultar documentos e acompanhar toda a operação em um único painel.

Minha proposta é desenvolver um produto independente, com arquitetura preparada para atender empresas de diferentes municípios, sem precisar reescrever o sistema a cada nova prefeitura.

A decisão técnica mais importante: não vamos desenvolver um emissor preso ao Webservice do Distrito Federal. Vamos desenvolver um motor fiscal central e uma camada de integração municipal, com conectores independentes.

Isso significa que o DF será nosso primeiro conector de referência, mas Belo Horizonte, São Paulo, Rio de Janeiro e outros municípios poderão ter integrações próprias.
1. Visão geral do produto
Nome provisório: NFS-e Hub

NFS-e Hub

GESTÃO FISCAL MULTIEMPRESA

Online

Notas emitidas
1.284


Empresas
48


Autorizadas
1.251


Com pendência
33



Últimas emissões
Empresa Demonstração Ltda.

NFS-e #001284

Autorizada

Comércio Exemplo Ltda.

NFS-e #001283

Autorizada

Serviços Modelo ME

DPS #001282

Em processamento


Prévia conceitual da interface — dados fictícios.

Funcionalidades do produto
- Cadastro de múltiplas empresas e filiais.
- Cadastro de clientes e tomadores.
- Cadastro de serviços e códigos tributários.
- Certificados digitais por empresa.
- Emissão individual e em lote.
- Emissão automática por API.
- Consulta e cancelamento de notas.
- Download de XML e PDF/DANFSe quando disponível.
- Histórico de transmissões.
- Relatórios financeiros e fiscais.
- Gestão de usuários e permissões.
- Planos, limites e cobrança SaaS.

2. Arquitetura técnica
Minha recomendação é utilizar:
Camada	Tecnologia
Frontend	React + Vite + TypeScript
UI	Tailwind CSS + shadcn/ui
Backend	Node.js + NestJS
Banco de dados	PostgreSQL
ORM	Prisma
Autenticação	Supabase Auth ou autenticação própria
Filas	Redis + BullMQ
Arquivos	S3 compatível
XML	fast-xml-parser + validação XSD
SOAP	Cliente SOAP com suporte a mTLS
Certificados	OpenSSL + biblioteca XMLDSig
Infraestrutura	Docker + EasyPanel
Monitoramento	Logs estruturados + Sentry

Por que NestJS?

Porque vamos ter vários módulos independentes: emissão, tributação, certificados, municípios, autenticação, filas e faturamento. NestJS facilita organizar isso sem transformar o projeto em um único arquivo gigantesco.

Também recomendo que o motor fiscal seja independente do frontend. Assim, futuramente poderemos integrar ERPs, sistemas de vendas, plataformas de contabilidade e aplicativos externos.
3. Uma descoberta importante: o Padrão Nacional já possui APIs REST
Na documentação oficial atualizada em 04/11/2026, encontrei uma estrutura que muda bastante nossa estratégia.

O Sistema Nacional NFS-e disponibiliza APIs separadas para:
- SEFIN Nacional: emissão, consulta e eventos fiscais.
- Parâmetros Municipais: alíquotas, regimes, benefícios e retenções.
- CNC: cadastro nacional de contribuintes.
- ADN: compartilhamento e distribuição de documentos fiscais.
- DANFSe: documentação e serviços relacionados à representação da nota.
Existem endpoints separados para produção restrita e produção. 
Serviços e Informações do Brasil+1


O manual de contribuintes descreve, entre outros:
Método	Operação
POST /nfse	Emitir NFS-e enviando uma DPS
GET /nfse/{chaveAcesso}	Consultar nota
GET /dps/{id}	Recuperar chave de acesso pela DPS
HEAD /dps/{id}	Verificar se a nota foi gerada
POST /nfse/{chaveAcesso}/eventos	Registrar evento
GET /nfse/{chaveAcesso}/eventos	Consultar eventos

Também existem consultas de parametrização por código IBGE do município, código de serviço e CPF/CNPJ. 
Emissor Público


Isso é excelente para nosso projeto: podemos implementar o conector nacional primeiro e reutilizá-lo para todos os municípios que utilizam a SEFIN Nacional como autorizadora.

Para os demais, teremos conectores específicos.
Nossa estratégia de conectores
MOTOR FISCAL CENTRAL

Recebe uma solicitação de emissão padronizada, sem conhecer o provedor municipal


ROTEADOR DE INTEGRAÇÕES

Identifica o município, a modalidade de autorização e a versão do conector
SEFIN Nacional

API REST + XML assinado


NotaControl DF

SOAP + XML


Provedores ABRASF

SOAP conforme implementação


Outros provedores

Adaptadores independentes





AUTORIZADORES FISCAIS

Retorno de autorização, rejeição, chave de acesso e XML


O roteador não deve escolher um conector apenas pelo nome da cidade. Ele deverá considerar o código IBGE, a adesão municipal ao sistema nacional, a configuração de autorização e a disponibilidade efetiva do serviço.

O portal oficial disponibiliza os manuais e os endereços Swagger para cada módulo. 
Serviços e Informações do Brasil+1


4. Estrutura do projeto
Vamos separar frontend e backend desde o primeiro dia.
nfse-hub/
│
├── apps/
│   ├── web/                    # React + Vite
│   └── api/                    # NestJS
│
├── packages/
│   ├── fiscal-core/            # Regras fiscais comuns
│   ├── nfse-types/             # Interfaces compartilhadas
│   ├── xml-engine/             # XML, XSD e assinatura
│   └── municipality-registry/  # Cadastro de municípios
│
├── services/
│   ├── national-sefin/         # API nacional
│   ├── nota-control-df/        # SOAP Distrito Federal
│   ├── abrasf/                 # Adaptadores ABRASF
│   └── worker/                 # Filas de processamento
│
├── infrastructure/
│   ├── docker/
│   └── database/
│
└── docs/
    ├── architecture.md
    ├── fiscal-rules.md
    └── integrations.md


Organização dos módulos NestJS
apps/api/src/
│
├── auth/
├── tenants/
├── users/
├── companies/
├── certificates/
├── customers/
├── services/
├── municipalities/
├── tax-rules/
├── invoices/
├── dps/
├── events/
├── integrations/
├── subscriptions/
├── audit/
└── storage/


Cada módulo terá suas próprias responsabilidades e regras de acesso.
5. Modelo de banco de dados
A estrutura será multi-tenant desde o início.

Isso significa que cada cliente SaaS terá seu próprio espaço lógico, e uma empresa não poderá visualizar documentos, certificados ou dados de outra.
Entidades principais
Relacionamento de dados
TENANTS

Clientes da plataforma SaaS


USERS / COMPANIES

Usuários, empresas e filiais


CERTIFICATES

Credenciais por empresa


CUSTOMERS

Tomadores


DPS

Declarações


INVOICES

Notas autorizadas




TRANSMISSIONS / EVENTS / AUDIT LOGS

Rastreabilidade completa da operação fiscal


Campos fundamentais
Tabela	Campos importantes
tenants	id, name, plan, status
companies	tenant_id, CNPJ, IM, código IBGE, regime
users	tenant_id, email, role
certificates	company_id, encrypted_storage_key, expires_at
municipalities	IBGE, provider, authorization_mode
customers	tenant_id, CPF/CNPJ, endereço
service_catalog	company_id, código nacional, código municipal
tax_parameters	município, serviço, vigência, parâmetros
dps	company_id, série, número, XML, status
invoices	DPS, chave de acesso, número, XML, status
transmissions	protocolo, endpoint, resposta, tentativas
invoice_events	nota, tipo, protocolo, resultado

A numeração da DPS deve ser sequencial e controlada por empresa e série, com concorrência protegida por transações no banco.

Regra de segurança: todas as tabelas com dados de clientes terão tenant_id, e o backend verificará o vínculo de cada registro com a empresa autorizada. Não confiaremos apenas no filtro enviado pelo React.
6. Atenção: certificado digital por cliente
Encontrei uma regra que afeta diretamente o modelo SaaS.

Segundo o FAQ oficial da Receita Federal, versão 1.2 de 27/10/2026:
- A assinatura da DPS deve pertencer ao próprio prestador.
- A autenticação mTLS também exige o certificado do prestador.
- O CNPJ/CPF do certificado é confrontado com o emitente da DPS.
- Não é possível emitir notas de vários prestadores usando um único certificado do integrador.
- A figura do PAA (Provedor de Assinatura e Autorização) está prevista, mas ainda depende de habilitação e disponibilidade. 
  Nota Fiscal de Serviço Eletrônica
Requisito obrigatório do SaaS
Cada empresa precisará cadastrar seu próprio certificado ICP-Brasil compatível com a integração.

Isso muda nossa estrutura:
1. Cada empresa terá um certificado isolado.
2. Cada transmissão usará as credenciais da respectiva empresa.
3. O worker deverá selecionar o certificado correto antes de transmitir.
4. A assinatura XML e o mTLS serão realizados individualmente.
5. O sistema bloqueará a emissão se o certificado não corresponder ao prestador.
Não vamos armazenar certificados em texto puro nem compartilhar uma credencial entre clientes.

Também precisamos desenvolver nossa própria geração do PDF DANFSe. A documentação oficial informa que a API governamental de geração automática de PDF está suspensa desde 03/08/2026. O XML autorizado é o documento fiscal oficial; o PDF é sua representação auxiliar. 
Nota Fiscal de Serviço Eletrônica


7. Implementação inicial — Backend
Vamos começar com um núcleo funcional, antes de implementar todos os conectores.
7.1. Contrato universal de emissão
Esse contrato será utilizado pelo frontend e por todos os conectores.

export type InvoiceStatus =
  | "draft"
  | "queued"
  | "processing"
  | "authorized"
  | "rejected"
  | "cancelled"
  | "unknown";

export interface NfseEmissionInput {
  companyId: string;
  customerId?: string;

  municipalityCode: string;
  serviceCode: string;
  competenceDate: string;

  customer: {
    document: string;
    name: string;
    email?: string;
    address?: {
      zipCode?: string;
      street?: string;
      number?: string;
      cityCode?: string;
    };
  };

  service: {
    description: string;
    amount: number;
    deductions?: number;
  };

  idempotencyKey: string;
}

export interface NfseEmissionResult {
  status: InvoiceStatus;
  provider: string;

  dpsId?: string;
  accessKey?: string;
  invoiceNumber?: string;

  xml?: string;
  pdfUrl?: string;

  protocol?: string;
  errors?: Array<{
    code: string;
    message: string;
  }>;
}



O contrato é interno. Cada conector será responsável por transformar esses dados no formato fiscal exigido pelo respectivo autorizador.

Não devemos assumir que todos os municípios aceitam os mesmos campos ou possuem os mesmos códigos tributários.
7.2. Interface dos conectores

export interface NfseProvider {
  readonly providerCode: string;

  supports(input: {
    municipalityCode: string;
    companyId: string;
  }): Promise<boolean>;

  getMunicipalParameters(input: {
    municipalityCode: string;
    companyId: string;
    serviceCode?: string;
  }): Promise<unknown>;

  issue(
    input: NfseEmissionInput
  ): Promise<NfseEmissionResult>;

  consult(input: {
    accessKey?: string;
    dpsId?: string;
    companyId: string;
  }): Promise<NfseEmissionResult>;

  cancel(input: {
    accessKey: string;
    companyId: string;
    reason: string;
  }): Promise<NfseEmissionResult>;
}



Cada implementação seguirá essa interface:
- NationalSefinProvider
- NotaControlDfProvider
- AbrasfProvider
- Outros conectores futuros.
A seleção será feita pelo registro de integrações, e não por condicionais espalhadas pelo sistema.
7.3. Rotas da API
Vamos começar com estes endpoints:
Método	Endpoint	Objetivo
POST	/companies	Cadastrar empresa
POST	/companies/:id/certificate	Enviar certificado
GET	/municipalities/:ibge/parameters	Consultar parâmetros
POST	/customers	Cadastrar tomador
POST	/invoices	Solicitar emissão
GET	/invoices	Listar notas
GET	/invoices/:id	Consultar detalhes
POST	/invoices/:id/cancel	Solicitar cancelamento
GET	/invoices/:id/xml	Baixar XML
GET	/invoices/:id/pdf	Gerar/baixar DANFSe

O endpoint de emissão não deve esperar indefinidamente a resposta do município. Ele cria uma operação, registra a idempotência e envia para a fila.
7.4. Exemplo do fluxo interno

@Injectable()
export class InvoiceService {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly queue: InvoiceQueue,
  ) {}

  async create(
    tenantId: string,
    input: NfseEmissionInput,
  ) {
    // 1. Validar empresa e acesso do tenant
    const company =
      await this.invoiceRepository.getCompany(
        tenantId,
        input.companyId,
      );

    if (!company) {
      throw new ForbiddenException(
        "Empresa não autorizada"
      );
    }

    // 2. Verificar duplicidade
    const existing =
      await this.invoiceRepository.findByIdempotencyKey(
        tenantId,
        input.idempotencyKey,
      );

    if (existing) return existing;

    // 3. Identificar conector
    const provider =
      await this.providerRegistry.resolve({
        municipalityCode: input.municipalityCode,
        companyId: company.id,
      });

    // 4. Registrar emissão
    const invoice =
      await this.invoiceRepository.create({
        tenantId,
        companyId: company.id,
        status: "queued",
        provider: provider.providerCode,
        idempotencyKey: input.idempotencyKey,
        payload: input,
      });

    // 5. Enfileirar processamento
    await this.queue.enqueue({
      tenantId,
      invoiceId: invoice.id,
    });

    return invoice;
  }
}



Esse exemplo representa o fluxo inicial. A implementação real deverá executar a verificação de duplicidade e a criação em uma transação atômica, com índice único no banco, e também usar uma outbox transacional para não perder operações entre o banco e o Redis.

8. Estrutura inicial do banco — Prisma
Este é o primeiro núcleo do schema. Ele já contempla separação entre clientes, empresas, certificados e documentos fiscais.

enum InvoiceStatus {
  DRAFT
  QUEUED
  PROCESSING
  AUTHORIZED
  REJECTED
  CANCELLED
  UNKNOWN
}

enum Environment {
  HOMOLOGATION
  PRODUCTION
}

model Tenant {
  id        String    @id @default(uuid())
  name      String
  status    String    @default("active")
  createdAt DateTime  @default(now())

  companies Company[]
  invoices  Invoice[]
}

model Company {
  id               String   @id @default(uuid())
  tenantId         String
  legalName        String
  document         String
  municipalReg     String?
  municipalityCode String
  taxRegime        String?
  createdAt        DateTime @default(now())

  tenant      Tenant      @relation(fields: [tenantId], references: [id])
  certificates Certificate[]
  invoices    Invoice[]

  @@unique([tenantId, document])
  @@index([municipalityCode])
}

model Certificate {
  id             String   @id @default(uuid())
  companyId      String
  encryptedKey   String
  expiresAt      DateTime
  fingerprint    String
  createdAt      DateTime @default(now())

  company Company @relation(
    fields: [companyId],
    references: [id]
  )
}

model Municipality {
  ibgeCode        String  @id
  name            String
  state           String
  providerCode    String
  authorizationMode String
  environment     String  @default("PRODUCTION")
  active          Boolean @default(false)
}

model Invoice {
  id              String        @id @default(uuid())
  tenantId        String
  companyId       String
  idempotencyKey  String
  providerCode    String
  status          InvoiceStatus @default(DRAFT)
  dpsSeries       String?
  dpsNumber       String?
  accessKey       String?
  invoiceNumber   String?
  xmlStorageKey   String?
  pdfStorageKey   String?
  amount          Decimal       @db.Decimal(15, 2)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  company Company @relation(fields: [companyId], references: [id])

  @@unique([tenantId, idempotencyKey])
  @@index([companyId, status])
  @@index([accessKey])
}



Antes de produção, vamos complementar esse schema com:
- Tabela de usuários e associação de permissões.
- Série e numeração DPS com controle transacional.
- Eventos fiscais.
- Transmissões e tentativas.
- Histórico de certificados.
- Parâmetros tributários versionados por vigência.
- Outbox e filas.
- Políticas RLS ou isolamento equivalente.
- Logs de auditoria imutáveis.
O certificado será armazenado em object storage privado e criptografado com uma chave de dados protegida por KMS ou mecanismo equivalente. O banco guardará somente a referência e os metadados.
9. Frontend React — telas do sistema
A interface deve ser um painel profissional, moderno e simples de operar.

Minha sugestão é manter uma identidade visual escura, com grafite, branco e laranja #F76415, mas sem exagerar nos elementos visuais.
Menu principal
Dashboard

Empresas

Emitir NFS-e

Notas fiscais

Clientes

Serviços

Municípios e integrações

Certificados digitais

Relatórios

Configurações


Telas que vamos desenvolver
Tela	Recursos
Dashboard	Indicadores e últimas emissões
Empresas	Cadastro, filiais e dados fiscais
Emissão	Formulário de DPS e validação
Notas fiscais	Filtros, status, XML e PDF
Clientes	Cadastro de tomadores
Serviços	Catálogo e códigos tributários
Integrações	Municípios, provedores e ambientes
Certificados	Upload, validade e situação
Relatórios	Faturamento e histórico
Administração	Usuários, planos e permissões

A tela de emissão terá preenchimento inteligente: selecionar empresa, selecionar cliente, selecionar serviço, informar valor e competência. O sistema buscará os parâmetros municipais e validará os campos antes de permitir o envio.
10. Plano de execução
Eu dividiria em seis sprints:
Sprint	Entrega
01	Estrutura, autenticação, tenants e banco
02	Cadastro de empresas, clientes e certificados
03	Motor XML, XSD e assinatura digital
04	Conector SEFIN Nacional e homologação
05	Conector DF e primeiro adaptador municipal adicional
06	Cancelamentos, DANFSe, relatórios e SaaS

Estimativa de planejamento: aproximadamente 6 a 10 semanas para um MVP bem delimitado, dependendo da disponibilidade dos ambientes, certificados e validações fiscais.
Critérios para considerar o MVP pronto
- Uma empresa consegue cadastrar seus dados.
- Consegue cadastrar seu certificado.
- Consegue cadastrar um tomador.
- O sistema consulta os parâmetros municipais.
- Gera e valida uma DPS.
- Assina o XML com o certificado correto.
- Transmite em homologação.
- Trata rejeições e retorna mensagens compreensíveis.
- Consegue consultar a nota autorizada.
- Armazena XML e gera o PDF.
- Impede emissões duplicadas.
- Mantém isolamento entre clientes SaaS.

11. Documentação oficial para a implementação
Estes são os materiais que devem ser tratados como referência técnica do projeto, principalmente porque o leiaute fiscal está recebendo atualizações.
Biblioteca técnica NFS-e
Documentação de produção

Manuais, XSD, anexos e versões atuais


Documentação oficial atualizada
APIs e Swagger

Endpoints de produção e homologação


Consultar APIs e ambientes
Manual dos contribuintes

Emissão, consulta, DPS e eventos


Abrir manual de integração
FAQ técnico atualizado

Certificados, assinaturas, tributação e erros


FAQ NFS-e — versão 1.2
Integração Distrito Federal

SOAP, WSDL e XML do conector DF


Manual NotaControl DF

12. Primeiro comando para o Antigravity
Eu começaria criando o esqueleto da aplicação, sem tentar implementar todas as regras tributárias de uma vez.

Este é o primeiro comando que passaria para o agente de desenvolvimento: