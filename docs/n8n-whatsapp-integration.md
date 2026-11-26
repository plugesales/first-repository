# Integração n8n + WhatsApp (Evolution API) + NFS-e Hub

Este documento descreve como conectar o **NFS-e Hub** rodando na sua VPS ao **n8n** e à **Evolution API** para emissão 100% automatizada de notas fiscais pelo WhatsApp.

---

## 🏗️ Fluxo da Automação

```
[Cliente no WhatsApp]
       │
       ▼ (Mensagem / Pedido / Pagamento confirmado)
[Evolution API]
       │
       ▼ (Webhook)
[n8n: Nó Webhook]
       │
       ▼ (Extrai CPF/CNPJ, Nome e Valor)
[n8n: HTTP Request -> NFS-e Hub API]
   POST /api/v1/webhooks/issue
   Header: x-api-key: SUA_CHAVE
       │
       ▼ (Processamento em segundo plano via Worker + Certificado A1)
[NFS-e Hub: SEFIN Nacional / Receita Federal]
       │
       ▼ (Retorna status AUTHORIZED + Chave de Acesso + PDF)
[n8n: HTTP Request -> Download DANFSe PDF]
   GET /api/v1/invoices/:id/pdf
       │
       ▼ (Disparo de Mensagem com Anexo PDF)
[Evolution API: /message/sendMedia]
       │
       ▼
[Cliente recebe o PDF da Nota Fiscal no WhatsApp em segundos!]
```

---

## 📡 Endpoints Disponíveis para o n8n

### 1. Solicitar Emissão Simplificada
* **Método:** `POST`
* **URL:** `https://nfse.seudominio.com/api/v1/webhooks/issue` (ou `/api/v1/invoices/quick-issue`)
* **Headers:**
  ```http
  Content-Type: application/json
  x-api-key: SUA_CHAVE_MESTRA_N8N
  ```
* **Corpo da Requisição (JSON):**
  ```json
  {
    "customer": {
      "document": "56950767000136",
      "name": "VIP SOLUÇÕES LTDA.",
      "email": "financeiro@cliente.com"
    },
    "amount": 150.00,
    "description": "DISPARO DE MENSAGENS EM MASSA VIA WHATSAPP",
    "serviceCode": "170601"
  }
  ```
  *(Nota: Se `serviceCode` ou `companyDocument` forem omitidos, o sistema usa automaticamente a empresa ativa com certificado A1 e o serviço padrão cadastrado).*

* **Resposta Imediata (HTTP 201 Created):**
  ```json
  {
    "success": true,
    "invoiceId": "437ed943-1dce-492d-9830-ec22e78e7baf",
    "status": "QUEUED",
    "idempotencyKey": "quick_1795574945363_um1xzli",
    "amount": 150.00,
    "trackingUrl": "/api/v1/invoices/437ed943-1dce-492d-9830-ec22e78e7baf",
    "pdfUrl": "/api/v1/invoices/437ed943-1dce-492d-9830-ec22e78e7baf/pdf",
    "xmlUrl": "/api/v1/invoices/437ed943-1dce-492d-9830-ec22e78e7baf/xml"
  }
  ```

---

### 2. Consultar Status da Nota
* **Método:** `GET`
* **URL:** `https://nfse.seudominio.com/api/v1/invoices/{{$json.invoiceId}}`
* **Headers:**
  ```http
  x-api-key: SUA_CHAVE_MESTRA_N8N
  ```
* **Resposta:**
  ```json
  {
    "id": "437ed943-1dce-492d-9830-ec22e78e7baf",
    "status": "AUTHORIZED",
    "invoiceNumber": "6",
    "accessKey": "53001082263140137000161000000000000626118839971007"
  }
  ```

---

### 3. Baixar DANFSe em PDF
* **Método:** `GET`
* **URL:** `https://nfse.seudominio.com/api/v1/invoices/{{$json.invoiceId}}/pdf`
* **Headers:**
  ```http
  x-api-key: SUA_CHAVE_MESTRA_N8N
  ```
* **Retorno:** Arquivo binário `application/pdf` do DANFSe oficial com QR Code.

---

### 4. Webhook de Retorno Automático (Push)
Se você preencher `N8N_WEBHOOK_URL` nas variáveis de ambiente da VPS:
O NFS-e Hub fará um POST automático para o seu n8n assim que a nota for aprovada pela Receita:
```json
{
  "event": "INVOICE_AUTHORIZED",
  "invoiceId": "437ed943-1dce-492d-9830-ec22e78e7baf",
  "status": "AUTHORIZED",
  "invoiceNumber": "6",
  "accessKey": "53001082263140137000161000000000000626118839971007",
  "pdfUrl": "/api/v1/invoices/437ed943-1dce-492d-9830-ec22e78e7baf/pdf",
  "timestamp": "2026-11-25T01:50:00.000Z"
}
```

---

## 🤖 Como Montar o Nó da Evolution API no n8n

Para enviar o PDF para o cliente no WhatsApp:

1. No n8n, crie um nó **HTTP Request**:
   - **Method:** `POST`
   - **URL:** `https://sua-evolution-api.seudominio.com/message/sendMedia/nome-da-instancia`
   - **Headers:**
     ```http
     apikey: SUA_EVOLUTION_API_KEY
     Content-Type: application/json
     ```
   - **Body (JSON):**
     ```json
     {
       "number": "{{$json.customerPhone}}",
       "mediaMessage": {
         "mediatype": "document",
         "fileName": "DANFSe_{{$json.invoiceNumber}}.pdf",
         "caption": "📄 Sua Nota Fiscal de Serviços foi emitida com sucesso!\n\nChave de Acesso: {{$json.accessKey}}",
         "media": "data:application/pdf;base64,{{$binary.data.base64}}"
       }
     }
     ```

