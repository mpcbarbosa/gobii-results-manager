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

**Endpoint:** `POST /api/ingest/leads`

**Headers:**
```
Authorization: Bearer YOUR_APP_INGEST_TOKEN
Content-Type: application/json
```

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
  "ids": ["uuid-1", "uuid-2"]
}
```

**Características:**
- ✅ **Idempotente**: Mesmo lead não é duplicado (usa `dedupe_key`)
- ✅ **Batch processing**: Processa múltiplos leads numa única chamada
- ✅ **Upsert automático**: Cria ou atualiza Account, Contact, Lead
- ✅ **Histórico completo**: Cria ScoringRun e LeadStatusHistory
- ✅ **Validação robusta**: Zod schemas para validação de payload

## Próximos Passos

Este projeto completou:
- ✅ **Milestone 0**: Foundation (Next.js, Prisma, Tailwind, shadcn/ui)
- ✅ **Milestone 1**: Core Database Schema (modelo de dados completo)
- ✅ **Milestone 2**: Ingestion API (endpoint idempotente para leads)

Os próximos milestones incluirão:

1. **Milestone 3**: Sistema de autenticação e autorização (NextAuth.js)
2. **Milestone 4**: APIs REST para gestão de leads (CRUD completo)
3. **Milestone 5**: Interface de utilizador (dashboards, listas, formulários)
4. **Milestone 6**: Analytics e Reporting

## Suporte

Para questões ou problemas, consulte a documentação em [`plans/architecture-summary.md`](plans/architecture-summary.md).
