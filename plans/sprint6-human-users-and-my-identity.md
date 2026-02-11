# Sprint 6 — Human Users & My Identity

## Overview

Sprint 6 fixes the ownerId inconsistency between work-queue and lead detail, adds human user creation, and introduces a "My Identity" selector for personalized queue filtering.

## Bug Fix: ownerId Consistency (G1)

**Problem**: `GET /api/admin/leads/[id]` did not include `ownerUser` relation in the Prisma query, so `ownerId`/`ownerName` were missing from the response even when set.

**Fix**: Added `ownerUser` include to the lead detail query and added `ownerId`, `ownerName`, `ownerEmail` to the response.

## User Creation (G2)

### POST /api/admin/users

Creates a new user with admin auth.

```json
{
  "name": "Miguel Barbosa",
  "email": "miguel@gobii.pt",
  "role": "ADMIN"
}
```

- Email normalized (trim + lowercase)
- Unique by email (409 if exists)
- Returns `{ success: true, item: { id, name, email, role, isActive } }`

## My Identity Selector

### Component: `UserIdentitySelector`

- Dropdown at top of Work Queue and My Queue pages
- Loads users from `GET /api/admin/users`
- Stores selection in `localStorage` key: `gobii.myUserId`
- Filters out system user (`system@gobii.internal`)
- Default: first non-system user

### My Queue Filtering

When a user is selected:
- My Queue calls `GET /api/admin/leads/work-queue?ownerId=<selectedUserId>&sort=sla`
- Shows only leads assigned to that user

### "Assign to Me" Action

In Work Queue, each row has a "📌 Me" button that:
- Calls `PATCH /api/admin/leads/[id]/owner` with the selected user's ID
- Updates the row optimistically
- Shows toast confirmation

## Activity Creator Attribution

`POST /api/admin/leads/[id]/activities` now accepts optional `createdById`:
- If provided and valid user exists, uses that user as creator
- Otherwise falls back to first admin user
- UI can pass the selected user's ID for proper attribution

## Files Changed

| File | Change |
|------|--------|
| `app/api/admin/leads/[id]/route.ts` | Added `ownerUser` include + `ownerId`/`ownerName`/`ownerEmail` in response |
| `app/api/admin/users/route.ts` | Added POST handler for user creation |
| `app/api/admin/leads/[id]/activities/route.ts` | Accept optional `createdById` in payload |
| `components/admin/UserIdentitySelector.tsx` | **New** — identity selector component |
| `app/admin/leads/work-queue/page.tsx` | Added identity selector + "Assign to me" button |
| `app/admin/leads/my-queue/page.tsx` | Added identity selector + ownerId filter |
| `lib/adminApi.ts` | Updated `fetchWorkQueue` params, added `assignLeadOwner` |

## Testing

```powershell
$env:APP_ADMIN_TOKEN = "your-token"

# Create a user
.\test-create-user.ps1

# Verify owner consistency
.\test-lead-owner-consistency.ps1

# Test my queue with SLA
.\test-my-queue.ps1
```
