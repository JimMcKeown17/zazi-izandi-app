# Zazi iZandi App — Claude Context

## Project Overview
A React Native mobile application for **Zazi iZandi (ZZ)**, a literacy programme run by the Masinyusane nonprofit. The app is for Education Assistants (EAs) teaching reading to children in under-resourced South African schools. Forked from the Masi app (`/Users/jimmckeown/Development/masi-app`) on 2026-04-22 and diverging as its own product.

**Current phase:** Phase 1 (Mobile Fork + Launch). Phase 2 adds a FastAPI AI backend on Render. Phase 3 migrates the ZZ website to Supabase (deferred 6–12 months).

## Documentation Structure

Canonical references for this session, in order of precedence:

- **`~/.claude/plans/can-you-consider-this-polished-allen.md`** — the approved Phase 1–3 plan (~750 lines). Source of truth for architecture decisions and task breakdown.
- **`documentation/zazi-izandi-fork-planv2.md`** — earlier ZZ fork plan; superseded by the approved plan above but useful for historical context.

Not yet written for ZZ (flag when you find yourself wanting them):
- `PRD.md`, `LEARNING.md`, `DATABASE_SCHEMA_GUIDE.md` — these exist in the Masi repo and should be ported + adapted for ZZ when we have time. Until then, schema questions → read `supabase-migrations/00_zazi_izandi_initial.sql` directly.

## Quick Reference

### Navigation
Bottom tabs: **Home → My Children → Today → Assessments**
- Profile accessed via gear icon (⚙️) in Home tab header, not a tab
- Sign In / Sign Out on Home screen, not a dedicated tab
- **Today tab is ZZ-specific** (replaces Masi's Sessions tab) — session timer + AI coach placeholders live here; `POST /ea/brief` + `POST /ea/chat` wire up in Phase 2
- Assessments tab contains EGRA Letter Sound Assessment + Letter Tracker

### Identity
- **Supabase project:** `qpgvfyxnamrawolclzfn` (https://qpgvfyxnamrawolclzfn.supabase.co), region `eu-west-1`, **paid plan**
- **Supabase org:** `ccwwqyebfqqnomestjdw` — a ZZ-only org, separate from Masi's `tsiupgaxilgtciknmyqi`
- **Bundle ID (iOS + Android):** `org.masinyusane.zz` — **IMMUTABLE** after Play Store publish
- **App scheme:** `zz-app://`
- **EAS project ID:** `d264d2ae-981f-4d72-b073-5bc3be3f23e3`
- **Role model:** single role — Education Assistant. No job title picker (Masi's multi-role model was dropped for ZZ).

## Deployment Status — Pre-Launch

ZZ is **pre-launch**. No end users yet. Schema drops, renames, and non-backwards-compatible changes are fine right now.

**Once the app ships to EAs**, the Masi backwards-compatibility rule activates:
> Multiple app versions will be simultaneously deployed. Users do not update immediately. Prefer backwards-compatible DB changes: add nullable columns, relax constraints; avoid column drops/renames until all users have updated. If you drop a column that an older app still writes, sync fails with `PGRST204` for every affected record.

Update this section when ZZ goes to production.

## Architecture Decisions Locked

These were decided in the approved plan. Do not re-open without user signal:

| Decision | Choice |
|---|---|
| Fork strategy | Fork Masi + diverge; separate repo, separate Supabase |
| Local storage + sync | Keep Supabase + AsyncStorage; `services/offlineSync.js` ported as-is. No PowerSync at launch (revisit at 2,500 active users). |
| Mobile auth | Supabase Auth; admin-added users only at launch (no self-signup) |
| AI backend (Phase 2) | **FastAPI on Render** — NOT Supabase Edge Functions. User strongly prefers Python. |
| Compute strategy (Phase 2) | Pure compute core (no ORM) + per-runtime record adapters. Shared `zz_compute` Python package between Django (existing website) and FastAPI (new mobile API). |
| Canonical identity | `user_id UUID = auth.users.id` on every EA-owned table. `staff_identity_links` is supplementary metadata, not a replacement profile table. |
| Authorization (Phase 2) | Service-role Postgres in FastAPI + strict `WHERE user_id = :current_user_id` in every repo function. Per-endpoint authz test matrix is a merge gate. RLS is defense-in-depth. |
| AI freshness gate (Phase 2) | Block `/ea/brief` and `/ea/chat` with `503 ai_blocked_compute_stale` when compute is >36h stale. Do NOT "serve stale with a note." |
| Scheduler | Render cron for production. APScheduler is dev-only. |

Full reasoning + the remaining rows (SSE idempotency, rate limiting, website dual-truth) are in the approved plan.

## Key Implementation Patterns

### Offline Sync
All writes save locally first (`synced: false`) → background sync upserts to Supabase when online → last-write-wins. Entry point: `src/services/offlineSync.js`. Storage abstraction: `src/utils/storage.js` (wraps AsyncStorage with typed `STORAGE_KEYS`).

### Canonical Identity — `staff_identity_links`
Every EA-owned table FKs directly to `auth.users(id)`. The `staff_identity_links` table holds supplementary metadata (`display_name`, `first_name`, `last_name`, `school_id`, optional `teampact_user_id` / `airtable_record_id` bridges).

**Invariant:** mobile must NEVER `INSERT INTO staff_identity_links` directly. The `on_auth_user_created` trigger (in `supabase-migrations/00_zazi_izandi_initial.sql`) auto-creates the row on `auth.users` INSERT. By the time the app makes its first authenticated request, the row exists. Mobile UPDATEs (for display_name, etc.) are fine.

### Session Timer (ZZ-specific)
`SessionTimer` component (`src/components/session/SessionTimer.js`) persists across backgrounding via AsyncStorage key `@active_session_started_at`. Emits `{ started_at, ended_at, duration_seconds }` on end. Session rows have matching columns. Escape hatch: "Log session without timer" on the Today screen.

## Known Issues & Safety Guards

### Upsert + RLS Visibility
PostgreSQL upserts (`INSERT ... ON CONFLICT DO UPDATE`) require **SELECT visibility through RLS** to check the unique index — even when no conflict exists. Junction-table-based SELECT policies will block upserts if the junction record hasn't synced yet. Fix: add a permissive SELECT policy on the direct column (e.g. `created_by = auth.uid()`). Preserved in the consolidated migration as the dual-policy pattern on `children` and `classes` — do not remove those policies thinking they're redundant.

### EAS Builds Can't Read `.env.local`
`process.env.EXPO_PUBLIC_*` from `.env.local` is NOT available in EAS cloud builds. Public values (Supabase URL, anon key) MUST also be in `app.json → extra` with a fallback in the client. Pattern is already wired in `src/services/supabaseClient.js`:
```javascript
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  || Constants.expoConfig?.extra?.supabaseUrl || '';
```
If you add a new `EXPO_PUBLIC_*` var, add it in BOTH places.

### Supabase MCP — Single Project in Scope
The Supabase MCP is OAuth-scoped to the ZZ org (`ccwwqyebfqqnomestjdw`), and `.mcp.json` pins `?project_ref=qpgvfyxnamrawolclzfn` as additional restriction. Running `list_projects` should return exactly one entry — the ZZ project. Masi (`jcqrlwetutnpuchjoyyd`) lives in a different org (`tsiupgaxilgtciknmyqi`) that this OAuth session cannot see.

**Discipline that still applies:**
1. Always pass `project_id: "qpgvfyxnamrawolclzfn"` explicitly on every Supabase MCP call. It's defense-in-depth if the OAuth scope ever widens or `.mcp.json` loses the pin.
2. If `list_projects` ever returns more than one project, STOP and investigate — the scope broke.
3. `get_project_url` is NOT a "where am I?" probe — it takes a required `project_id` and echoes. Use `list_projects` to discover what's in scope.

The anon key in `app.json → extra` and `.env` comes from this project (`sb_publishable_GTzgHbdPGaxA0lgzQsuMeA_jrp59-hO`). Historical note: an earlier ZZ project (`wqkroylvxuorcjwoplqv`, same org as Masi) was deleted on 2026-04-23 and migrated here for true org-level isolation.

### Advisor State (baseline)
Security advisors: **clean** (0 warnings). The initial migration ships with `SET search_path = public, pg_temp` on every function. Performance advisors: expected noise only — all indexes flag as "unused" until the app has real query traffic, and the dual SELECT policies on `children`/`classes` intentionally trigger `multiple_permissive_policies` WARN (that's the load-bearing upsert-visibility pattern — see above). If a new WARN appears in a category other than these, investigate.

### Debugging Tools
- **Profile → Export Logs** — captures `console.log/error/warn` output to a shareable text file
- **Profile → Export Database** — exports full AsyncStorage as JSON (sync queue, retry counts, failed items)

## Development Conventions

- **Always branch** off main for features or bug fixes. Do not push directly to main.
- **Never commit or push without explicit user authorization** (words like "commit" / "push" / "save"). Git safety: no `--no-verify`, no force pushes to main, no amending published commits.
- **Prefer bottom sheets over Dialog components** for pickers (carried over from Masi UX feedback).
- **Python for backend / AI work** (FastAPI, Django) — the user pushed back on Edge Functions; don't propose JS/TS backends unless there's a strong reason.
- **Integration tests hit a real database**, not mocks. Mock/prod divergence has burned this project before.
- **When the user shares a Codex review**, engage each finding substantively — don't accept or reject wholesale.

## Current Task State

Phase 1 tasks 1–8 are complete. Remaining (details in the approved plan):

- **Task 9** — Client-side auto-grouping after assessment — **BLOCKED** on the user sharing the Python reference path
- **Task 10** — Letter Tracker quick-access button on child cards in `ChildrenListScreen` — unblocked, small
- **Task 11** — Groups view with per-group stats — unblocked, medium
- **Task 12** — Phase 1 verification checklist — runs after 9/10/11

Before picking up any Supabase-touching task, confirm `list_projects` still returns only the ZZ project.
