# Sprint 2 — Commercial Prioritization

## Overview

Sprint 2 introduces **commercial prioritization** to the CRM, enabling human operators to quickly answer three questions:

1. **Which leads deserve attention now?**
2. **Why?**
3. **What was the last relevant signal?**

All prioritization is **derived at query time** from existing SYSTEM activities — nothing is persisted as a "score" or "temperature" in the database.

---

## Core Concepts

### Signal vs Decision

| Concept | Description |
|---------|-------------|
| **Signal** | A fact detected by a Gobii agent (e.g., "RFP detected for SAP S/4HANA"). Stored as a SYSTEM Activity. |
| **Decision** | A human action taken in response to signals (e.g., "Schedule a call", "Mark as QUALIFIED"). |

The system **surfaces signals** but **never makes decisions**. The human operator always has the final say.

### Why No Persisted Scoring

Traditional CRM scoring has several problems:

- **Opacity** — "Score 78" tells you nothing about *why*.
- **Staleness** — Scores become outdated as new signals arrive.
- **Tuning burden** — Weights need constant adjustment.

Instead, we derive everything on-the-fly:

```
SYSTEM Activities → deriveCommercialSignal() → signalLevel + reasons
                                              → deriveLeadTemperature() → HOT / WARM / COLD
```

This means:

- ✅ Every classification is **explainable** (reasons array)
- ✅ Every classification is **current** (computed at query time)
- ✅ No "magic numbers" to maintain
- ✅ Full audit trail via Activity records

---

## Signal Classification Rules

### HIGH → HOT

A lead is classified as HIGH (temperature: HOT) when **any** of these conditions are met:

- ≥1 SYSTEM activity with `category ∈ {RFP, ERP_REPLACEMENT}`
- ≥1 SYSTEM activity with `confidence = HIGH`

**Real-world examples:**

| Signal | Category | Why it's HIGH |
|--------|----------|---------------|
| "RFP identificado para ERP SAP S/4HANA" | RFP | Active procurement process — time-sensitive |
| "Empresa anunciou substituição de ERP legacy" | ERP_REPLACEMENT | Budget allocated, decision imminent |

### MEDIUM → WARM

A lead is classified as MEDIUM (temperature: WARM) when:

- ≥1 SYSTEM activity with `category ∈ {EXPANSION, C_LEVEL}`
- OR ≥2 SYSTEM activities in the last 14 days (activity burst)

**Real-world examples:**

| Signal | Category | Why it's MEDIUM |
|--------|----------|-----------------|
| "Empresa abriu nova filial em Madrid" | EXPANSION | Growth = potential new IT needs |
| "Novo CTO nomeado" | C_LEVEL | New leadership often triggers tech reviews |
| Multiple signals in 14 days | (burst) | Increased activity suggests something is happening |

### LOW → COLD

Everything else. The lead exists but has no strong commercial indicators right now.

---

## Architecture

### Helpers (no side effects, pure functions)

```
lib/crm/deriveCommercialSignal.ts
  → parseActivityMeta(notes)     — extracts agent/category/confidence from Activity.notes
  → deriveCommercialSignal(activities) — returns { signalLevel, reasons, lastSignalAt, lastSignalCategory }

lib/crm/deriveLeadTemperature.ts
  → deriveLeadTemperature(signalLevel) — maps HIGH→HOT, MEDIUM→WARM, LOW→COLD
```

### Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/leads/work-queue` | Prioritized list of non-terminal leads with signal + temperature |
| `GET /api/admin/leads/[id]` | Lead detail, now includes `commercialSignal` block |

### Work Queue Ordering

The work queue sorts leads by:

1. **Temperature** — HOT first, then WARM, then COLD
2. **Last signal date** — most recent first (within same temperature)
3. **Score** — highest first (within same signal date)

---

## How to Use the Work Queue

### For the Commercial Operator

1. **Start your day** by calling the work queue endpoint
2. **Focus on HOT leads first** — these have active procurement signals
3. **Read the reasons** — they tell you exactly *why* the lead is hot
4. **Check lastSignalAt** — if it's recent, act fast
5. **Work through WARM leads** when HOT leads are handled
6. **COLD leads** can wait — review them weekly

### API Usage

```bash
# Get the work queue
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/admin/leads/work-queue

# Get enriched lead detail
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/admin/leads/{id}
```

### Response Example (Work Queue)

```json
{
  "success": true,
  "count": 3,
  "items": [
    {
      "id": "uuid-1",
      "company": "Empresa ABC",
      "status": "QUALIFIED",
      "score_final": 85.5,
      "signalLevel": "HIGH",
      "temperature": "HOT",
      "reasons": ["RFP detected", "High confidence signal from SAP_Scanner"],
      "lastSignalAt": "2026-02-08T14:30:00.000Z",
      "lastActivityAt": "2026-02-08T14:30:00.000Z"
    },
    {
      "id": "uuid-2",
      "company": "Empresa XYZ",
      "status": "NEW",
      "score_final": 72.0,
      "signalLevel": "MEDIUM",
      "temperature": "WARM",
      "reasons": ["Recent expansion signal"],
      "lastSignalAt": "2026-02-05T10:00:00.000Z",
      "lastActivityAt": "2026-02-05T10:00:00.000Z"
    }
  ]
}
```

### Response Example (Lead Detail — commercialSignal block)

```json
{
  "commercialSignal": {
    "signalLevel": "HIGH",
    "temperature": "HOT",
    "reasons": ["RFP detected"],
    "lastSignalAt": "2026-02-08T14:30:00.000Z",
    "lastSignalCategory": "RFP"
  }
}
```

---

## What's NOT in This Sprint

| Feature | Sprint |
|---------|--------|
| Machine learning / weight tuning | 3+ |
| Dashboard / UI components | 3+ |
| Automated email or task creation | 3+ |
| Persisted scores or temperatures | Never (by design) |

---

## Testing

Run the PowerShell test script:

```powershell
$env:APP_ADMIN_TOKEN = "your-token"
.\test-work-queue.ps1
```

This will display a formatted table with company, temperature, signal level, reasons, and last signal date.
