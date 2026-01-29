# Gobii Results Manager

Sistema para gerenciar workflows e resultados de processos de negócio do Gobii.

## Stack Tecnológica

- **Framework**: Next.js 15+ (App Router)
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Package Manager**: npm

## Pré-requisitos (Windows)

Antes de começar, certifique-se de ter instalado:

1. **Node.js 20 LTS ou superior**
   - Download: https://nodejs.org/
   - Verifique a instalação: `node --version` e `npm --version`

2. **Docker Desktop** (recomendado para desenvolvimento)
   - Download: https://www.docker.com/products/docker-desktop/
   - Verifique a instalação: `docker --version` e `docker compose version`
   - **OU** PostgreSQL 15+ instalado localmente (ver secção alternativa abaixo)

3. **Git** (opcional, mas recomendado)
   - Download: https://git-scm.com/download/win

## Setup Local (Windows)

### 1. Clone o repositório (ou extraia os ficheiros)

```bash
git clone <repository-url>
cd gobii-results-manager_clean
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure a base de dados PostgreSQL

#### Opção A: Usando Docker (Recomendado) 🐳

Inicie o PostgreSQL via Docker Compose:

```bash
# Inicie o container PostgreSQL em background
docker compose up -d

# Verifique se está a correr
docker compose ps

# Ver logs (opcional)
docker compose logs -f postgres
```

O PostgreSQL estará disponível em `localhost:5432` com:
- Database: `gobii`
- User: `postgres`
- Password: `postgres`

**Comandos úteis:**
```bash
# Parar o container (mantém os dados)
docker compose stop

# Parar e remover o container (mantém os dados no volume)
docker compose down

# Remover tudo incluindo dados (⚠️ cuidado!)
docker compose down -v

# Reiniciar o container
docker compose restart
```

#### Opção B: PostgreSQL instalado localmente

Se preferir instalar PostgreSQL diretamente no Windows:

1. Download: https://www.postgresql.org/download/windows/
2. Durante a instalação, anote a senha do utilizador `postgres`
3. Crie a base de dados:

```bash
# Conecte-se ao PostgreSQL
psql -U postgres

# Crie a base de dados
CREATE DATABASE gobii_results_manager;

# Saia do psql
\q
```

### 4. Configure as variáveis de ambiente

Copie o ficheiro `.env.example` para `.env`:

```bash
copy .env.example .env
```

Edite o ficheiro `.env` e configure a `DATABASE_URL`:

**Para Docker (recomendado):**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gobii?schema=public"
```

**Para PostgreSQL local:**
```env
DATABASE_URL="postgresql://postgres:SUA_SENHA@localhost:5432/gobii_results_manager?schema=public"
```

**Formato da DATABASE_URL:**
```
postgresql://[UTILIZADOR]:[SENHA]@[HOST]:[PORTA]/[NOME_DB]?schema=public
```

### 5. Execute as migrations do Prisma

```bash
# Gera o Prisma Client
npm run db:generate

# Executa as migrations (cria as tabelas)
npm run db:migrate

# (Opcional) Popula a base de dados com dados iniciais
npm run db:seed
```

### 6. Inicie o servidor de desenvolvimento

```bash
npm run dev
```

A aplicação estará disponível em: **http://localhost:3000**

## Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Cria a build de produção |
| `npm run start` | Inicia o servidor de produção |
| `npm run lint` | Executa o linter |
| `npm run db:generate` | Gera o Prisma Client |
| `npm run db:migrate` | Executa migrations do Prisma |
| `npm run db:seed` | Popula a base de dados com dados iniciais |
| `npm run db:studio` | Abre o Prisma Studio (GUI para a BD) |
| `npm run db:push` | Sincroniza o schema sem criar migration |
| `npm run db:reset` | Reseta a base de dados (⚠️ apaga todos os dados) |

## Estrutura do Projeto

```
gobii-results-manager_clean/
├── app/                    # Next.js App Router
│   ├── globals.css        # Estilos globais
│   ├── layout.tsx         # Layout principal
│   └── page.tsx           # Página inicial
├── components/            # Componentes React reutilizáveis
│   └── ui/               # Componentes shadcn/ui (a adicionar)
├── lib/                   # Utilitários e configurações
│   ├── prisma.ts         # Prisma Client singleton
│   └── utils.ts          # Funções utilitárias
├── prisma/               # Prisma ORM
│   ├── schema.prisma     # Schema da base de dados
│   └── seed.ts           # Script de seed
├── plans/                # Documentação de arquitetura
│   └── architecture-summary.md
├── .env.example          # Exemplo de variáveis de ambiente
├── .gitignore           # Ficheiros ignorados pelo Git
├── components.json      # Configuração shadcn/ui
├── next.config.ts       # Configuração Next.js
├── package.json         # Dependências e scripts
├── postcss.config.mjs   # Configuração PostCSS
├── tailwind.config.ts   # Configuração Tailwind CSS
└── tsconfig.json        # Configuração TypeScript
```

## Troubleshooting (Windows)

### Erro: "psql não é reconhecido como comando"
- Adicione o PostgreSQL ao PATH do Windows:
  - Painel de Controlo → Sistema → Configurações avançadas do sistema
  - Variáveis de ambiente → PATH
  - Adicione: `C:\Program Files\PostgreSQL\15\bin`

### Erro: "Cannot connect to database"
- Verifique se o PostgreSQL está a correr:
  - Abra "Serviços" (services.msc)
  - Procure por "postgresql-x64-15"
  - Certifique-se que está "Em execução"

### Erro: "Port 3000 already in use"
- Mate o processo na porta 3000:
  ```bash
  netstat -ano | findstr :3000
  taskkill /PID [PID_NUMBER] /F
  ```

### Erro de permissões no Prisma
- Execute o terminal como Administrador
- Ou use: `npm run db:migrate -- --skip-generate`

## Modelo de Dados (Milestone 1)

O sistema utiliza um schema PostgreSQL production-grade com as seguintes entidades:

### Entidades Principais

| Entidade | Descrição | Características |
|----------|-----------|-----------------|
| **sources** | Agentes Gobii (scanners, scorers) | Rastreamento de origem dos leads |
| **accounts** | Empresas/Organizações | Deduplicação via `name_normalized` e `domain` |
| **leads** | Instâncias de leads | Deduplicação via `dedupe_key` (SHA256) |
| **scoring_runs** | Histórico de scoring | Auditoria completa de scores |
| **users** | Equipa interna | RBAC com 4 roles |
| **lead_assignments** | Ownership temporal | Rastreamento de responsabilidade |
| **lead_status_history** | Pipeline de estados | Audit trail completo |
| **contacts** | Pessoas nas empresas | CRM-light |
| **interactions** | Chamadas, emails, reuniões | Tracking de engagement |
| **handoffs** | Transição para marketing/sales | Workflow de aprovação |

### Características do Schema

- ✅ **UUID** como primary key em todas as tabelas
- ✅ **Soft delete** (`deleted_at`) em accounts, leads, contacts
- ✅ **Timestamps** automáticos (`created_at`, `updated_at`)
- ✅ **Foreign keys** explícitas com cascades controladas
- ✅ **Índices estratégicos** para queries frequentes
- ✅ **Enums** para valores controlados (UserRole, LeadStatus, etc.)
- ✅ **Campos normalizados** para deduplicação eficiente
- ✅ **Integridade referencial** rigorosa

### Enums Disponíveis

- `UserRole`: ADMIN, OPERATIONS_LEAD, OPERATOR, VIEWER
- `LeadStatus`: NEW, REVIEWING, QUALIFIED, DISQUALIFIED, CONTACTED, ENGAGED, NURTURING, READY_HANDOFF, HANDED_OFF, ARCHIVED
- `InteractionChannel`: PHONE, EMAIL, LINKEDIN, MEETING, WHATSAPP, OTHER
- `InteractionOutcome`: SUCCESSFUL, NO_ANSWER, VOICEMAIL, WRONG_CONTACT, NOT_INTERESTED, CALLBACK_LATER, MEETING_BOOKED, INFO_SENT, OTHER
- `HandoffTeam`: MARKETING, SALES, PARTNERSHIPS, CUSTOMER_SUCCESS
- `HandoffStatus`: PENDING, ACCEPTED, REJECTED, COMPLETED, CANCELLED

Para mais detalhes, consulte [`prisma/schema.prisma`](prisma/schema.prisma).

## API Endpoints (Milestone 2)

### Health Check

Verifica a conectividade com a base de dados:

```bash
curl http://localhost:3000/api/health
```

**Resposta:**
```json
{
  "ok": true,
  "timestamp": "2026-01-28T14:00:00.000Z",
  "database": "connected"
}
```

### Ingestion API

Endpoint para ingestão de leads dos agentes Gobii (idempotente).

**Autenticação:** Bearer token via header `Authorization`

**Tokens aceites:**
- `APP_INGEST_TOKEN` (primário para scanners/agentes)
- `APP_ADMIN_TOKEN` (override para testes manuais)

**Endpoint:** `POST /api/ingest/leads`

**Headers:**
```
Authorization: Bearer YOUR_APP_INGEST_TOKEN
Content-Type: application/json
```

**Segurança:**
- Se `APP_INGEST_TOKEN` não estiver configurado, retorna 500 (não permite ingestão não autenticada)
- Token é trimmed antes da comparação
- Comparação segura de tokens

**Payload:**
```json
{
  "source": {
    "key": "SAPS4HANALeadScannerDaily"
  },
  "leads": [
    {
      "external_id": "optional-external-id",
      "company": {
        "name": "Empresa Exemplo Lda",
        "country": "PT",
        "industry": "Manufacturing",
        "size": "50-200",
        "website": "https://exemplo.pt",
        "tax_id": "123456789"
      },
      "contact": {
        "full_name": "João Silva",
        "email": "joao.silva@exemplo.pt",
        "phone": "+351912345678",
        "role": "CTO"
      },
      "trigger": "Implementação SAP S/4HANA em curso",
      "probability": 0.85,
      "score_trigger": 70,
      "score_probability": 17,
      "score_final": 87,
      "summary": "Empresa em processo de migração para SAP S/4HANA",
      "raw": {
        "source_url": "https://...",
        "detected_at": "2026-01-28T10:00:00Z"
      }
    }
  ]
}
```

**Exemplo cURL:**
```bash
curl -X POST http://localhost:3000/api/ingest/leads \
  -H "Authorization: Bearer your-secure-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "source": {"key": "TestScanner"},
    "leads": [{
      "company": {
        "name": "Test Company",
        "country": "PT"
      },
      "trigger": "Test trigger",
      "probability": 0.8,
      "score_trigger": 60,
      "score_probability": 16,
      "score_final": 76
    }]
  }'
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "counts": {
    "created": 1,
    "updated": 0,
    "skipped": 0
  },
  "domainAutofill": {
    "applied": 1,
    "skipped": 0
  },
  "ids": ["uuid-1", "uuid-2"]
}
```

**Características:**
- ✅ **Idempotente**: Mesmo lead não é duplicado (usa `dedupe_key`)
- ✅ **Batch processing**: Processa múltiplos leads numa única chamada
- ✅ **Upsert automático**: Cria ou atualiza Account, Contact, Lead
- ✅ **Histórico completo**: Cria ScoringRun e LeadStatusHistory
- ✅ **Validação robusta**: Zod schemas para validação de payload
- ✅ **Domain autofill**: Preenche/corrige domains automaticamente (ver abaixo)

**Domain Autofill (Automático):**

Durante a ingestão, o sistema tenta preencher ou corrigir o campo `domain` das contas:

**Regras:**
1. **Quando aplicar**: Se `account.domain` é `null` OU inválido (espaços, sem ponto, URL-like, etc.)
2. **Heurísticas**: Extrai domain de `company.website` ou `contact.email`
3. **Confidence threshold**: Só aplica se confidence = `HIGH`
   - Website: sempre HIGH
   - Email: HIGH se ≥2 emails ou match com nome da empresa
4. **Proteção**: NUNCA sobrescreve domains válidos existentes

**Comportamento:**
- `domainAutofill.applied`: Domains preenchidos/corrigidos automaticamente
- `domainAutofill.skipped`: Sugestões com confidence MEDIUM (usar admin tool)

**Exemplo:**
```json
{
  "company": {
    "name": "Empresa Exemplo",
    "domain": null,
    "website": "https://www.exemplo.pt"
  }
}
```
→ Domain autofilled para `exemplo.pt` (confidence: HIGH, source: website)

### Leads Query API (Read)

Endpoints para consultar e listar leads (requer `APP_READ_TOKEN`).

#### GET /api/leads

Lista leads com paginação, filtros e ordenação.

**Autenticação:** Bearer token via header `Authorization`

**Headers:**
```
Authorization: Bearer YOUR_APP_READ_TOKEN
```

**Query Parameters:**

| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `page` | number | 1 | Número da página |
| `pageSize` | number | 25 | Itens por página (max 100) |
| `sort` | string | created_at | Campo de ordenação: `created_at`, `updated_at`, `score`, `probability` |
| `order` | string | desc | Ordem: `asc` ou `desc` |
| `status` | string | - | Filtro por status (pode ser múltiplo: `NEW,QUALIFIED`) |
| `source` | string | - | Filtro por source key |
| `minScore` | number | - | Score mínimo (0-100) |
| `maxScore` | number | - | Score máximo (0-100) |
| `minProbability` | number | - | Probabilidade mínima (0-1) |
| `maxProbability` | number | - | Probabilidade máxima (0-1) |
| `country` | string | - | Filtro por país da empresa |
| `q` | string | - | Pesquisa textual (nome empresa, trigger, email) |
| `assignedTo` | string | - | UUID do utilizador atribuído |
| `unassigned` | boolean | - | Filtrar leads não atribuídos |
| `handoffStatus` | string | - | Filtro por status de handoff |
| `from` | string | - | Data inicial (ISO 8601) |
| `to` | string | - | Data final (ISO 8601) |

**Exemplo cURL:**
```bash
curl -X GET "http://localhost:3000/api/leads?page=1&pageSize=10&status=NEW,QUALIFIED&sort=score&order=desc" \
  -H "Authorization: Bearer your-read-token"
```

**Exemplo PowerShell:**
```powershell
$headers = @{
    "Authorization" = "Bearer your-read-token"
}
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/leads?page=1&pageSize=10" -Headers $headers
$response.items | Format-Table
```

**Resposta:**
```json
{
  "items": [
    {
      "lead": {
        "id": "uuid",
        "createdAt": "2026-01-28T10:00:00Z",
        "updatedAt": "2026-01-28T10:00:00Z",
        "status": "NEW",
        "trigger": "Implementação SAP S/4HANA",
        "probability": 0.85,
        "scoreTrigger": 70,
        "scoreProbability": 17,
        "scoreFinal": 87,
        "summary": "Empresa em migração SAP",
        "priority": 8,
        "tags": ["high-value"]
      },
      "company": {
        "accountId": "uuid",
        "accountName": "Empresa Exemplo",
        "domain": "exemplo.pt",
        "country": "PT",
        "industry": "Manufacturing",
        "size": "50-200"
      },
      "source": {
        "sourceId": "uuid",
        "sourceKey": "SAPS4HANAScanner",
        "sourceType": "scanner"
      },
      "primaryContact": {
        "contactId": "uuid",
        "name": "João Silva",
        "email": "joao@exemplo.pt",
        "phone": "+351912345678",
        "role": "CTO"
      },
      "assignment": {
        "assignedToUserId": "uuid",
        "assignedToName": "Operator One",
        "assignedToEmail": "operator1@gobii.com",
        "assignedAt": "2026-01-28T10:00:00Z"
      },
      "lastInteraction": {
        "interactionId": "uuid",
        "lastInteractionAt": "2026-01-28T11:00:00Z",
        "lastInteractionChannel": "EMAIL",
        "lastInteractionOutcome": "INFO_SENT"
      },
      "handoff": null,
      "scoring": {
        "latestScore": 87,
        "scoringVersion": "v1.0",
        "scoredAt": "2026-01-28T10:00:00Z"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 42,
    "totalPages": 5
  },
  "filters": {
    "status": "NEW,QUALIFIED",
    "source": null,
    "minScore": null,
    "maxScore": null,
    "country": null,
    "q": null
  },
  "sort": {
    "field": "score",
    "order": "desc"
  }
}
```

#### GET /api/leads/{id}

Obtém detalhe completo de um lead específico.

**Autenticação:** Bearer token via header `Authorization`

**Exemplo cURL:**
```bash
curl -X GET "http://localhost:3000/api/leads/{lead-uuid}" \
  -H "Authorization: Bearer your-read-token"
```

**Exemplo PowerShell:**
```powershell
$headers = @{
    "Authorization" = "Bearer your-read-token"
}
$leadId = "your-lead-uuid"
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/leads/$leadId" -Headers $headers
$response | ConvertTo-Json -Depth 10
```

**Resposta:**
```json
{
  "lead": {
    "id": "uuid",
    "dedupeKey": "sha256-hash",
    "externalId": "optional-external-id",
    "createdAt": "2026-01-28T10:00:00Z",
    "updatedAt": "2026-01-28T10:00:00Z",
    "status": "QUALIFIED",
    "statusReason": "Meets qualification criteria",
    "priority": 8,
    "tags": ["high-value", "enterprise"],
    "trigger": "Implementação SAP S/4HANA",
    "summary": "Empresa em processo de migração",
    "probability": 0.85,
    "scoreTrigger": 70,
    "scoreProbability": 17,
    "scoreFinal": 87,
    "title": "CTO",
    "seniority": "C-Level",
    "department": "Engineering"
  },
  "source": {
    "id": "uuid",
    "name": "SAPS4HANAScanner",
    "type": "scanner",
    "description": "Scanner for SAP S/4HANA implementations"
  },
  "account": {
    "id": "uuid",
    "name": "Empresa Exemplo Lda",
    "domain": "exemplo.pt",
    "website": "https://exemplo.pt",
    "industry": "Manufacturing",
    "size": "50-200",
    "location": "Porto",
    "country": "PT",
    "description": "Leading manufacturer",
    "linkedinUrl": "https://linkedin.com/company/exemplo"
  },
  "contacts": [
    {
      "id": "uuid",
      "fullName": "João Silva",
      "email": "joao@exemplo.pt",
      "phone": "+351912345678",
      "title": "CTO",
      "department": "Engineering",
      "seniority": "C-Level",
      "linkedinUrl": "https://linkedin.com/in/joaosilva",
      "isPrimary": true
    }
  ],
  "statusHistory": [
    {
      "id": "uuid",
      "fromStatus": "NEW",
      "toStatus": "QUALIFIED",
      "reason": "Meets qualification criteria",
      "notes": "High score and good fit",
      "changedAt": "2026-01-28T10:30:00Z",
      "changedBy": {
        "id": "uuid",
        "name": "Operator One",
        "email": "operator1@gobii.com"
      }
    }
  ],
  "scoringRuns": [
    {
      "id": "uuid",
      "score": 87,
      "scoreData": {...},
      "version": "v1.0",
      "createdAt": "2026-01-28T10:00:00Z"
    }
  ],
  "interactions": [
    {
      "id": "uuid",
      "channel": "EMAIL",
      "outcome": "INFO_SENT",
      "subject": "Introduction to Gobii",
      "notes": "Sent case studies",
      "duration": null,
      "scheduledAt": null,
      "completedAt": "2026-01-28T11:00:00Z",
      "createdAt": "2026-01-28T11:00:00Z",
      "contact": {...},
      "user": {...}
    }
  ],
  "assignments": [
    {
      "id": "uuid",
      "assignedAt": "2026-01-28T10:00:00Z",
      "unassignedAt": null,
      "reason": "High priority lead",
      "notes": "Focus on enterprise value",
      "user": {...}
    }
  ],
  "handoffs": []
}
```

**Características da API de Leitura:**
- ✅ **Paginação eficiente**: Suporta até 100 itens por página
- ✅ **Filtros múltiplos**: Combina vários filtros numa única query
- ✅ **Ordenação flexível**: Por data, score ou probabilidade
- ✅ **Pesquisa textual**: Busca em múltiplos campos
- ✅ **Includes otimizados**: Evita N+1 queries
- ✅ **Soft delete aware**: Exclui automaticamente registos apagados
- ✅ **Detalhe completo**: Endpoint dedicado com histórico completo

### Admin API

Endpoints administrativos para manutenção do sistema (requer `APP_ADMIN_TOKEN`).

#### GET /api/admin/accounts

Lista contas do sistema com paginação e pesquisa. Útil para obter `accountId` para testes ou operações administrativas.

**Autenticação:** Bearer token via header `Authorization`

**Headers:**
```
Authorization: Bearer YOUR_APP_ADMIN_TOKEN
```

**Query Parameters:**

| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `take` | number | 20 | Número de itens (max 100) |
| `skip` | number | 0 | Número de itens a saltar |
| `q` | string | - | Pesquisa em name ou domain (case-insensitive) |

**Exemplo cURL:**
```bash
curl -X GET "http://localhost:3000/api/admin/accounts?take=10&q=exemplo" \
  -H "Authorization: Bearer your-admin-token"
```

**Exemplo PowerShell:**
```powershell
$headers = @{
    "Authorization" = "Bearer your-admin-token"
}
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/accounts?take=10&q=exemplo" -Headers $headers
$response.items | Format-Table id, name, domain, updatedAt
```

**Resposta:**
```json
{
  "success": true,
  "take": 10,
  "skip": 0,
  "count": 42,
  "items": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Empresa Exemplo Lda",
      "domain": "exemplo.pt",
      "updatedAt": "2026-01-29T10:00:00.000Z"
    },
    {
      "id": "123e4567-e89b-12d3-a456-426614174001",
      "name": "Another Company",
      "domain": null,
      "updatedAt": "2026-01-28T15:30:00.000Z"
    }
  ]
}
```

**Características:**
- ✅ **Paginação**: Suporta até 100 itens por página
- ✅ **Pesquisa**: Busca case-insensitive em name e domain
- ✅ **Ordenação**: Por updatedAt desc (mais recentes primeiro)
- ✅ **Contagem total**: Retorna count para paginação

#### POST /api/admin/accounts/backfill-domain

Atualiza o campo `domain` de múltiplas contas em batch. Útil para corrigir dados históricos ou migração de dados.

**Autenticação:** Bearer token via header `Authorization`

**Headers:**
```
Authorization: Bearer YOUR_APP_ADMIN_TOKEN
Content-Type: application/json
```

**Payload:**
```json
{
  "updates": [
    {
      "accountId": "uuid-da-conta-1",
      "domain": "exemplo.pt"
    },
    {
      "accountId": "uuid-da-conta-2",
      "domain": null
    }
  ]
}
```

**Validações:**
- `domain` deve ser string ou `null`
- `domain` não pode conter espaços (rejeitado)
- `domain` é normalizado: lowercase + trim
- Strings vazias após trim são convertidas para `null`

**Exemplo cURL:**
```bash
curl -X POST http://localhost:3000/api/admin/accounts/backfill-domain \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {"accountId": "123e4567-e89b-12d3-a456-426614174000", "domain": "example.com"},
      {"accountId": "123e4567-e89b-12d3-a456-426614174001", "domain": null}
    ]
  }'
```

**Exemplo PowerShell:**
```powershell
$headers = @{
    "Authorization" = "Bearer your-admin-token"
    "Content-Type" = "application/json"
}
$body = @{
    updates = @(
        @{ accountId = "123e4567-e89b-12d3-a456-426614174000"; domain = "example.com" },
        @{ accountId = "123e4567-e89b-12d3-a456-426614174001"; domain = $null }
    )
} | ConvertTo-Json -Depth 3

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/accounts/backfill-domain" `
    -Method Post -Headers $headers -Body $body
$response | ConvertTo-Json
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "updatedCount": 2,
  "updated": [
    {
      "accountId": "uuid-1",
      "oldDomain": "fallback-empresa-exemplo-pt",
      "newDomain": "exemplo.pt"
    },
    {
      "accountId": "uuid-2",
      "oldDomain": "example.com",
      "newDomain": null
    }
  ],
  "skipped": []
}
```

**Resposta com Erros:**
```json
{
  "success": true,
  "updatedCount": 1,
  "updated": [
    {
      "accountId": "uuid-1",
      "oldDomain": null,
      "newDomain": "exemplo.pt"
    }
  ],
  "skipped": [
    {
      "accountId": "uuid-2",
      "reason": "Domain cannot contain spaces"
    },
    {
      "accountId": "uuid-3",
      "reason": "Account not found"
    }
  ]
}
```

**Características:**
- ✅ **Batch processing**: Atualiza múltiplas contas numa única chamada
- ✅ **Validação rigorosa**: Rejeita domains com espaços
- ✅ **Normalização automática**: Lowercase + trim
- ✅ **Relatório detalhado**: Lista sucessos e falhas
- ✅ **Idempotente**: Pode ser executado múltiplas vezes
- ✅ **Audit trail**: Retorna valores antigos e novos

#### GET /api/admin/accounts/suggest-domains

Gera sugestões de domínios para contas (dry-run). Não altera a base de dados.

**Autenticação:** Bearer token via header `Authorization`

**Headers:**
```
Authorization: Bearer YOUR_APP_ADMIN_TOKEN
```

**Query Parameters:**

| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `take` | number | 50 | Número de itens (max 200) |
| `skip` | number | 0 | Número de itens a saltar |
| `mode` | string | missing | `missing`, `all`, `invalid`, `missing_or_invalid` |
| `minConfidence` | string | medium | `low`, `medium` ou `high` |

**Modos:**
- `missing`: Apenas contas com `domain = null`
- `all`: Todas as contas
- `invalid`: Apenas contas com domain inválido (não-null mas inválido)
- `missing_or_invalid`: Contas com domain null OU inválido

**Regras de Domain Inválido:**
- Contém espaços
- Não contém ponto (.)
- Começa com "http" ou contém "/" (parece URL)
- Contém "@" (parece email)
- Comprimento < 3
- Contém caracteres fora de [a-z0-9.-]

**Heurísticas de Sugestão:**
1. **Website**: Extrai hostname do campo `website`, normaliza e valida
2. **Email**: Analisa emails dos contactos, ignora providers pessoais (gmail, outlook, etc.)
3. **Confidence**:
   - `high`: ≥2 emails matching ou domain match com nome da empresa
   - `medium`: 1 email corporativo
   - `low`: outras situações

**Exemplo PowerShell (dry-run - domains em falta):**
```powershell
$headers = @{
    "Authorization" = "Bearer your-admin-token"
}
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/accounts/suggest-domains?mode=missing&minConfidence=medium" -Headers $headers
$response.items | Format-Table accountId, name, currentDomain, suggestedDomain, confidence, source
```

**Exemplo PowerShell (dry-run - domains inválidos):**
```powershell
# Encontrar e corrigir domains inválidos (ex: "http://example.com", "user@example.com", "example com")
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/accounts/suggest-domains?mode=invalid&minConfidence=high" -Headers $headers
$response.items | Where-Object { $_.suggestedDomain } | Format-Table accountId, currentDomain, suggestedDomain, confidence
```

**Resposta:**
```json
{
  "success": true,
  "take": 50,
  "skip": 0,
  "count": 120,
  "items": [
    {
      "accountId": "uuid-1",
      "name": "Empresa Exemplo Lda",
      "currentDomain": null,
      "suggestedDomain": "exemplo.pt",
      "confidence": "high",
      "source": "website",
      "evidence": {
        "website": "https://www.exemplo.pt",
        "emailsUsed": []
      }
    },
    {
      "accountId": "uuid-2",
      "name": "Another Company",
      "currentDomain": null,
      "suggestedDomain": "company.com",
      "confidence": "high",
      "source": "email",
      "evidence": {
        "website": null,
        "emailsUsed": ["john@company.com", "jane@company.com"]
      }
    }
  ]
}
```

#### POST /api/admin/accounts/apply-suggested-domains

Aplica sugestões de domínios geradas server-side. Recomputa sugestões para garantir segurança.

**Autenticação:** Bearer token via header `Authorization`

**Headers:**
```
Authorization: Bearer YOUR_APP_ADMIN_TOKEN
Content-Type: application/json
```

**Payload:**
```json
{
  "accountIds": ["uuid-1", "uuid-2"],
  "minConfidence": "high",
  "overwriteInvalid": true,
  "overwriteValid": false
}
```

**Parâmetros:**
- `accountIds`: Array de UUIDs (máximo 200)
- `minConfidence`: `medium` ou `high` (default: `high`)
- `overwriteInvalid`: Sobrescrever domains inválidos (default: `true`)
- `overwriteValid`: Sobrescrever domains válidos (default: `false`)

**Validações e Segurança:**
- Máximo 200 `accountIds` por chamada
- Sugestões são recomputadas server-side (não confia no cliente)
- **Proteção de domains válidos**: Por default, NÃO sobrescreve domains válidos
- **Correção automática**: Por default, sobrescreve domains inválidos

**Exemplo PowerShell (aplicar sugestões):**
```powershell
$headers = @{
    "Authorization" = "Bearer your-admin-token"
    "Content-Type" = "application/json"
}

# Primeiro, obter sugestões (dry-run)
$suggestions = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/accounts/suggest-domains?mode=missing&minConfidence=high" -Headers $headers

# Extrair accountIds com high confidence
$accountIds = $suggestions.items | Where-Object { $_.confidence -eq "high" } | Select-Object -ExpandProperty accountId

# Aplicar sugestões
$body = @{
    accountIds = $accountIds
    minConfidence = "high"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/accounts/apply-suggested-domains" `
    -Method Post -Headers $headers -Body $body
$result | ConvertTo-Json
```

**Resposta:**
```json
{
  "success": true,
  "updatedCount": 2,
  "updated": [
    {
      "accountId": "uuid-1",
      "oldDomain": null,
      "newDomain": "exemplo.pt",
      "confidence": "high",
      "source": "website"
    },
    {
      "accountId": "uuid-2",
      "oldDomain": null,
      "newDomain": "company.com",
      "confidence": "high",
      "source": "email"
    }
  ],
  "skipped": [
    {
      "accountId": "uuid-3",
      "reason": "Confidence medium below threshold high"
    }
  ]
}
```

**Características:**
- ✅ **Production-grade**: Recomputa sugestões server-side
- ✅ **Batch-safe**: Até 200 contas por chamada
- ✅ **Confidence filtering**: Só aplica se confidence >= threshold
- ✅ **Heurísticas inteligentes**: Website > Email corporativo
- ✅ **Ignora providers pessoais**: gmail, outlook, hotmail, etc.
- ✅ **Relatório detalhado**: Updated + skipped com razões

## Próximos Passos

Este projeto completou:
- ✅ **Milestone 0**: Foundation (Next.js, Prisma, Tailwind, shadcn/ui)
- ✅ **Milestone 1**: Core Database Schema (modelo de dados completo)
- ✅ **Milestone 2**: Ingestion API (endpoint idempotente para leads)
- ✅ **Milestone 3A**: Leads Query API (leitura com paginação e filtros)

Os próximos milestones incluirão:

1. **Milestone 3B**: Leads Mutation API (update, delete, assign)
2. **Milestone 4**: Sistema de autenticação e autorização (NextAuth.js)
3. **Milestone 5**: Interface de utilizador (dashboards, listas, formulários)
4. **Milestone 6**: Analytics e Reporting

## Suporte

Para questões ou problemas, consulte a documentação em [`plans/architecture-summary.md`](plans/architecture-summary.md).
