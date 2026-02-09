# Sprint 1: CRM Auto-alimentado por Agentes Gobii

## Resumo
Implementação de infraestrutura para permitir que agentes Gobii criem automaticamente Activities do tipo SYSTEM de forma controlada e auditável.

## Data de Implementação
2026-02-08

---

## Objetivo

Permitir que agentes Gobii:
1. Resolvam uma lead existente (por domain ou nome)
2. Criem uma Activity SYSTEM
3. Evitem duplicados
4. Apliquem regras simples de status

---

## Implementação

### 1. Helper `resolveLead`
**Ficheiro:** [`lib/utils/resolveLead.ts`](../lib/utils/resolveLead.ts)

Resolve uma lead por domain ou nome da empresa:

```typescript
resolveLead(company: {
  domain?: string;
  name?: string;
})
```

**Ordem de resolução:**
1. Por `domain` (normalizado, lowercase) - mais confiável
2. Por `name` (case-insensitive via `account.nameNormalized`)
3. Retorna a lead mais recente se múltiplas existirem
4. Retorna `null` se não encontrar

**Características:**
- Ignora leads com `deletedAt` não-nulo
- Usa índices existentes para performance
- Não cria leads automaticamente

### 2. Endpoint de Ingestão
**Ficheiro:** [`app/api/ingest/activity/route.ts`](../app/api/ingest/activity/route.ts)

**Rota:** `POST /api/ingest/activity`

**Autenticação:** Bearer token via `APP_INGEST_TOKEN`

#### Payload Esperado

```json
{
  "company": {
    "name": "Grupo Exemplo",
    "domain": "exemplo.pt"
  },
  "activity": {
    "title": "RFP identificado para ERP",
    "notes": "Entidade lançou concurso com referência a ERP / SAP S/4HANA.",
    "meta": {
      "agent": "SAP_S4HANA_RFPScanner_Daily",
      "category": "RFP",
      "confidence": "HIGH",
      "source_url": "https://...",
      "detected_at": "2026-02-09"
    }
  }
}
```

**Campos obrigatórios:**
- `company.domain` OU `company.name` (pelo menos um)
- `activity.title`

**Campos opcionais:**
- `activity.notes`
- `activity.meta` (objeto JSON livre)

#### Respostas

**Sucesso (201):**
```json
{
  "success": true,
  "leadId": "uuid",
  "activityId": "uuid"
}
```

**Duplicado (200):**
```json
{
  "success": true,
  "duplicated": true
}
```

**Erros:**
- `401` - Autenticação inválida
- `404` - Lead não encontrada
- `400` - Payload inválido
- `500` - Erro interno

### 3. Deduplicação

**Lógica implementada:**

Antes de criar uma Activity SYSTEM, verifica se já existe nos **últimos 30 dias** uma activity com:
- Mesmo `leadId`
- Mesmo `type = SYSTEM`
- Mesmo `meta.agent`
- Mesmo `meta.category`
- Mesmo `meta.source_url`

Se existir, retorna `{ success: true, duplicated: true }` sem criar nova activity.

**Implementação:**
- Busca activities dos últimos 30 dias
- Compara campos meta incluídos nas notes formatadas
- Evita spam de activities idênticas

### 4. Regras Automáticas de Status

**Transição NEW → CONTACTED:**

Quando uma Activity SYSTEM é criada:
- Se `lead.status === 'NEW'`
- E `activity.meta.category` ∈ `['RFP', 'EXPANSION']`
- Então: `lead.status` → `'CONTACTED'`

**Proteção de Status Terminais:**

Não altera status se lead está em:
- `WON`
- `LOST`
- `DISCARDED`

**Histórico:**
- Todas as mudanças de status são registadas em `LeadStatusHistory`
- Inclui razão automática: "Automatically changed to CONTACTED by agent activity (category: RFP)"

### 5. Atualizações Automáticas

Sempre que uma Activity é criada:
- `lead.lastActivityAt` = `now()`
- Permite tracking de última atividade

### 6. Formatação de Notes

As notes da Activity incluem automaticamente metadados:

```
[notes originais]

---
Agent: SAP_S4HANA_RFPScanner_Daily
Category: RFP
Confidence: HIGH
Source: https://...
Detected: 2026-02-09
```

Isto permite:
- Auditoria completa
- Deduplicação eficaz
- Rastreabilidade de origem

### 7. Utilizador Sistema

Cria automaticamente (se não existir) um utilizador:
- Email: `system@gobii.internal`
- Nome: `Gobii System`
- Role: `ADMIN`
- Usado como `createdBy` para todas as Activities SYSTEM

---

## Testes

### Script PowerShell
**Ficheiro:** [`test-activity-ingest.ps1`](../test-activity-ingest.ps1)

**Uso:**
```powershell
# Definir token
$env:APP_INGEST_TOKEN = "your-token-here"

# Executar teste
.\test-activity-ingest.ps1
```

### Teste Manual com curl

```bash
curl -X POST http://localhost:3000/api/ingest/activity \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "company": {
      "domain": "exemplo.pt"
    },
    "activity": {
      "title": "RFP identificado",
      "notes": "Concurso público detectado",
      "meta": {
        "agent": "RFPScanner",
        "category": "RFP",
        "confidence": "HIGH",
        "source_url": "https://example.com/rfp/123",
        "detected_at": "2026-02-09"
      }
    }
  }'
```

### Verificação na UI

1. Aceder a `/admin/leads`
2. Abrir uma lead
3. Verificar Activity timeline
4. Confirmar:
   - Activity SYSTEM aparece
   - Status mudou para CONTACTED (se aplicável)
   - Notes incluem metadados formatados

---

## Segurança

### Autenticação
- Usa `APP_INGEST_TOKEN` (mesmo padrão de `/api/ingest/leads`)
- Bearer token no header `Authorization`
- Rejeita pedidos sem token ou com token inválido

### Validação
- Valida estrutura do payload
- Valida campos obrigatórios
- Rejeita JSON inválido

### Proteção de Dados
- Não cria leads automaticamente (evita poluição)
- Não altera status terminais
- Mantém histórico completo de mudanças

---

## Transações

Todas as operações críticas usam transações Prisma:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Criar activity
  // 2. Atualizar lead
  // 3. Criar status history (se aplicável)
});
```

Garante:
- Consistência de dados
- Rollback automático em caso de erro
- Atomicidade das operações

---

## Ficheiros Criados/Modificados

### Novos Ficheiros
- ➕ [`lib/utils/resolveLead.ts`](../lib/utils/resolveLead.ts) - Helper de resolução de leads
- ➕ [`app/api/ingest/activity/route.ts`](../app/api/ingest/activity/route.ts) - Endpoint de ingestão
- ➕ [`test-activity-ingest.ps1`](../test-activity-ingest.ps1) - Script de teste
- ➕ [`plans/sprint1-agent-activities.md`](./sprint1-agent-activities.md) - Esta documentação

### Ficheiros Não Modificados
- ✅ Schema Prisma (sem alterações)
- ✅ UI (sem alterações)
- ✅ Modelos existentes (sem alterações)
- ✅ Lógica comercial humana (sem alterações)

---

## Build Status

✅ TypeScript compilation passes  
✅ Next.js build succeeds  
✅ No schema changes required  
✅ Ready for deployment

---

## Casos de Uso

### 1. Agente RFP Scanner
```json
{
  "company": { "domain": "empresa.pt" },
  "activity": {
    "title": "RFP detectado para SAP S/4HANA",
    "notes": "Concurso público #2024/123",
    "meta": {
      "agent": "SAP_RFPScanner",
      "category": "RFP",
      "confidence": "HIGH",
      "source_url": "https://base.gov.pt/...",
      "detected_at": "2026-02-09"
    }
  }
}
```

**Resultado:**
- Activity criada
- Lead muda de NEW → CONTACTED
- Aparece na timeline

### 2. Agente Expansion Tracker
```json
{
  "company": { "name": "Grupo XYZ" },
  "activity": {
    "title": "Expansão internacional anunciada",
    "notes": "Empresa anuncia abertura de 5 novos escritórios",
    "meta": {
      "agent": "ExpansionTracker",
      "category": "EXPANSION",
      "confidence": "MEDIUM",
      "source_url": "https://news.example.com/...",
      "detected_at": "2026-02-09"
    }
  }
}
```

**Resultado:**
- Activity criada
- Lead muda de NEW → CONTACTED
- Sinal de crescimento registado

### 3. Agente News Monitor (sem auto-contact)
```json
{
  "company": { "domain": "empresa.pt" },
  "activity": {
    "title": "Menção em notícia",
    "notes": "Empresa mencionada em artigo sobre inovação",
    "meta": {
      "agent": "NewsMonitor",
      "category": "NEWS",
      "confidence": "LOW",
      "source_url": "https://jornal.pt/...",
      "detected_at": "2026-02-09"
    }
  }
}
```

**Resultado:**
- Activity criada
- Status NÃO muda (categoria não é RFP/EXPANSION)
- Informação contextual adicionada

---

## Limitações Conhecidas

### Não Implementado (por design)
- ❌ Criação automática de leads
- ❌ Scoring automático
- ❌ Notificações
- ❌ UI para agentes
- ❌ Webhooks de resposta

### Melhorias Futuras (fora de scope)
- Armazenar `meta` em campo JSON separado (atualmente nas notes)
- Configuração de categorias auto-contact via admin
- Dashboard de activities por agente
- Rate limiting por agente
- Webhooks para notificar agentes de mudanças

---

## Deployment

### Variáveis de Ambiente Necessárias
```bash
APP_INGEST_TOKEN=your-secure-token-here
DATABASE_URL=postgresql://...
```

### Passos para Deploy (Render)
1. Push código para repositório
2. Render detecta mudanças
3. Build automático (`npm run build`)
4. Deploy automático
5. Verificar logs para confirmar

### Verificação Pós-Deploy
```bash
# Health check
curl https://your-app.onrender.com/api/health

# Test activity ingest
curl -X POST https://your-app.onrender.com/api/ingest/activity \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"company":{"domain":"test.pt"},"activity":{"title":"Test"}}'
```

---

## Critérios de Aceitação ✅

- ✅ `npm run build` passa
- ✅ Endpoint testável por PowerShell / curl
- ✅ Activities aparecem na timeline da lead
- ✅ Status muda corretamente para CONTACTED
- ✅ Duplicados não são criados
- ✅ Sem alterações de UI
- ✅ Sem alterações de schema
- ✅ Sem interferência na ação comercial humana

---

## Conclusão

A Sprint 1 está completa. Qualquer agente Gobii pode agora:
- Sinalizar eventos do mundo real
- Enriquecer o CRM automaticamente
- Sem interferir na ação comercial humana
- Com auditoria completa e deduplicação

O sistema está pronto para receber activities de múltiplos agentes de forma controlada e escalável.
