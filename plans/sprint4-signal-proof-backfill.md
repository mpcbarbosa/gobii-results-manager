# Sprint 4 — Signal Proof, System Meta Rendering & Backfill

## Overview

Sprint 4 delivers three improvements to the CRM commercial prioritization:

1. **Signal Proof in Work Queue** — drill-down into the agent, category, confidence, and source URL that caused a lead's temperature.
2. **SYSTEM Meta Rendering in Lead Detail** — structured display of agent signals instead of raw notes blobs.
3. **Minimal Backfill Endpoint** — admin-only endpoint to create inferred SYSTEM activities for leads missing signals.

---

## A) Work Queue Signal Proof

### New Fields

The `deriveCommercialSignal()` function now returns three additional fields derived from the most recent SYSTEM activity:

| Field | Type | Description |
|-------|------|-------------|
| `lastSignalAgent` | `string \| null` | Agent name (e.g., "SAP_S4HANA_RFPScanner_Daily") |
| `lastSignalSourceUrl` | `string \| null` | Sanitized URL (http/https only) |
| `lastSignalConfidence` | `string \| null` | Confidence level (HIGH/MEDIUM/LOW) |

### API Changes

Both endpoints now include these fields:

- `GET /api/admin/leads/work-queue` — per item
- `GET /api/admin/leads/[id]` — in `commercialSignal` block

### UI Changes

The Work Queue table now has a "Signal Proof" column showing:
- 🤖 Agent name (truncated to 20 chars)
- Category badge + Confidence badge
- 🔗 Link icon to open source URL in new tab (when present)

---

## B) Lead Detail SYSTEM Meta Rendering

### Changes

For each Activity of type `SYSTEM` in the timeline:

- A purple-themed "System signal" block is rendered with:
  - **Agent** name
  - **Category** badge
  - **Confidence** badge (color-coded: HIGH=red, MEDIUM=amber, LOW=gray)
  - **Detected at** date
  - **Open source** link (when valid http/https URL)
- Original user-facing notes are shown below the meta block
- SYSTEM activities have a purple left border (vs blue for human activities)

### Shared Parser

Both the backend (`deriveCommercialSignal`) and frontend (lead detail page) use the same parser:

```
lib/crm/parseSystemMeta.ts
  → parseSystemMeta(notes)     — extracts agent/category/confidence/sourceUrl/detectedAt
  → sanitizeSourceUrl(url)     — only allows http:// or https://
```

---

## C) Backfill Endpoint

### Endpoint

```
POST /api/admin/leads/backfill-signals
```

### Authentication

`requireAdminAuth` (Bearer token or session cookie)

### Input

```json
{
  "take": 200,           // max leads to scan (default 200, max 1000)
  "dryRun": true,        // default true — preview without creating
  "lookbackDays": 30,    // window for dedup check
  "onlyIfNoSystemInDays": 30  // skip leads with recent SYSTEM activities
}
```

### Behavior

1. Select non-terminal leads (≠ WON, LOST, DISCARDED)
2. For each lead without SYSTEM activities in the lookback window:
   - Infer **category** from `enrichedData.trigger`:
     - Contains "RFP" or "concurso" → `RFP`
     - Contains "SAP", "S/4", "ERP replacement" → `ERP_REPLACEMENT`
     - Contains "expans", "fábrica", "logística", "M&A" → `EXPANSION`
     - Contains "CIO", "CTO", "CFO", "COO", "IT Director", "Head of" → `C_LEVEL`
     - Otherwise → `ERP_SIGNAL`
   - Infer **confidence** from `scoreDetails.probability_value` or `scoreDetails.probability`:
     - ≥ 0.7 → `HIGH`
     - ≥ 0.4 → `MEDIUM`
     - Otherwise → `LOW`
   - Create 1 SYSTEM activity titled "Backfilled signal" with formatted notes

### Idempotency

- Checks for existing backfill activity with same `agent=Backfill` + `category` + `title="Backfilled signal"`
- Safe to re-run: will skip already-backfilled leads

### Output

```json
{
  "success": true,
  "dryRun": true,
  "scanned": 200,
  "eligible": 150,
  "created": 0,
  "skipped": 50,
  "items": [
    {
      "leadId": "uuid",
      "company": "Empresa ABC",
      "domain": "abc.pt",
      "inferredCategory": "RFP",
      "inferredConfidence": "HIGH",
      "created": false,
      "reason": "Would create (dry run)"
    }
  ]
}
```

### Safety Design

- **Default dryRun=true** — must explicitly set `false` to create activities
- **Deterministic** — same input always produces same output
- **No external calls** — all inference from existing lead data
- **Idempotent** — re-running won't create duplicates
- **Bounded** — `take` parameter limits scope (max 1000)
- **Auditable** — every backfill activity has `Agent: Backfill` in notes

---

## Testing

```powershell
# Set token
$env:APP_ADMIN_TOKEN = "your-token"

# Test backfill (dry run)
.\test-backfill.ps1

# Test work queue
.\test-work-queue.ps1

# Start dev server and open work queue
npm run dev
# http://localhost:3000/admin/leads/work-queue
```

---

## Files Changed/Created

| File | Change |
|------|--------|
| `lib/crm/parseSystemMeta.ts` | **New** — shared parser + URL sanitizer |
| `lib/crm/deriveCommercialSignal.ts` | Extended with agent/sourceUrl/confidence fields |
| `app/api/admin/leads/work-queue/route.ts` | Added new signal fields to response |
| `app/api/admin/leads/[id]/route.ts` | Added new signal fields to commercialSignal |
| `lib/adminApi.ts` | Updated WorkQueueItem type |
| `app/admin/leads/work-queue/page.tsx` | Added Signal Proof column |
| `app/admin/leads/[id]/page.tsx` | SYSTEM meta rendering in timeline |
| `app/api/admin/leads/backfill-signals/route.ts` | **New** — backfill endpoint |
| `test-backfill.ps1` | **New** — test script |
| `plans/sprint4-signal-proof-backfill.md` | **New** — this document |
