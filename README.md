# Zazi iZandi Mobile App

A React Native mobile application for **Zazi iZandi (ZZ)**, a literacy programme run by the Masinyusane nonprofit in South Africa's Eastern Cape. The app supports Education Assistants (EAs) teaching reading to children in under-resourced schools: time tracking, children management, session recording, EGRA letter assessments, and auto-grouping.

Forked from the Masi field-staff app and diverging as its own product. See `CLAUDE.md` for architectural context and `documentation/zazi-izandi-fork-planv2.md` for the fork rationale.

## Features

- ✅ Supabase authentication (admin-added users at launch)
- ✅ GPS-verified time tracking (sign in / sign out)
- ✅ Children + classes + schools management (admin-managed school directory)
- ✅ Session recording with session timer
- ✅ EGRA letter assessments + Letter Tracker per child
- ✅ Auto-grouping (splits children into Letters / Blending tracks, size-optimized)
- ✅ Groups view with per-group stats (sessions this week, current letter, progress, size)
- ✅ Offline-first architecture with background sync
- 🚧 AI coach (daily brief + chat) — Phase 2, backed by FastAPI service

## Tech Stack

- React Native (Expo SDK 54) — JavaScript, no TypeScript
- Supabase (Postgres + Auth + RLS)
- React Navigation (bottom tabs + native stack)
- React Native Paper (UI)
- AsyncStorage (offline cache + sync queue)
- Jest (`jest-expo` preset)

## Prerequisites

- Node.js 18+
- npm
- Expo CLI (`npm install -g expo-cli`) — optional, `npx expo` works
- iOS Simulator (Xcode) or Android Emulator (Android Studio), or Expo Go on a physical device
- EAS CLI (`npm install -g eas-cli`) for cloud builds

## Setup

### 1. Install dependencies

```bash
git clone https://github.com/JimMcKeown17/zazi-izandi-app.git
cd zazi-izandi-app
npm install
```

### 2. Configure environment

Copy the template and fill in Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://qpgvfyxnamrawolclzfn.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_…
```

The ZZ Supabase project URL and publishable key are also mirrored in `app.json → extra` so EAS cloud builds (which don't read `.env.local`) can still access them. If you add a new `EXPO_PUBLIC_*` var, **add it in both places** — see the `supabaseClient.js` fallback pattern.

### 3. Run the app

```bash
npx expo start           # dev server
npx expo start --ios     # iOS Simulator
npx expo start --android # Android Emulator
```

Or scan the QR code with Expo Go on a physical device.

### 4. Cloud builds (EAS)

```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

## Database

Schema lives in `supabase-migrations/` as consolidated SQL. Current migrations:

- `00_zazi_izandi_initial.sql` — full baseline schema (11 tables: staff_identity_links, schools, classes, children, staff_children junction, groups, children_groups junction, time_entries, sessions, assessments, letter_mastery). All functions pinned to `search_path = public, pg_temp`; all RLS policies use `(select auth.uid())` for per-query evaluation.
- `01_extend_schools.sql` — adds metadata columns to `schools` (airtable_record_id, masi_school_id, suburb, latitude/longitude, google_maps_url, info).

The consolidated migration ran against the ZZ Supabase project on 2026-04-23 via `mcp__supabase__apply_migration`. New migrations are applied the same way — they show up in `list_migrations`.

## Project Structure

```
src/
├── components/
│   ├── assessment/      # EGRA grid, timer, last-letter sheet
│   ├── children/        # Child form, group picker, child card bits
│   ├── common/          # Button, Input, Card, LoadingSpinner, SyncIndicator
│   ├── dashboard/       # StatBar, RankedBarRow for Home dashboard
│   ├── groups/          # Preview-group picker for auto-grouping
│   └── session/         # Session timer
├── constants/           # colors, literacyConstants (LETTER_ORDER), egraConstants, options
├── context/             # AuthContext, OfflineContext, ChildrenContext, ClassesContext
├── hooks/               # useTimeTracking
├── navigation/          # AppNavigator (tabs + stacks)
├── screens/
│   ├── auth/            # Login, ForgotPassword
│   ├── main/            # Home, Today, ChildrenList, Assessments, Profile, SyncStatus
│   ├── children/        # ClassDetail, CreateClass, EditClass, AddChild, EditChild
│   ├── sessions/        # SessionForm, SessionHistory, LiteracySessionForm
│   ├── assessments/     # EGRA screens + LetterTracker
│   ├── groups/          # AutoGroupingPreview, Groups (stats view)
│   └── insights/        # Letter mastery / assessment / session count rankings
├── services/            # supabaseClient, offlineSync, locationService
└── utils/               # storage, dashboardStats, autoGrouping, groupStats,
                         # letterMastery, debugExport, logger
```

## Testing

```bash
npm test
```

Current coverage: algorithm + data-projection helpers (autoGrouping, groupStats, storage helpers) and a handful of screen-level sanity tests. 68 tests pass as of this writing.

## Offline Sync

All writes save locally first with `synced: false`, then a background job upserts to Supabase when online. Last-write-wins conflict resolution; exponential backoff with up to 5 retry attempts. Entry point: `src/services/offlineSync.js`. Storage abstraction: `src/utils/storage.js` (typed `STORAGE_KEYS`).

One known trap: Postgres upserts require SELECT visibility through RLS to check the unique index, even when no conflict exists. The children and classes tables use a **dual SELECT policy pattern** (junction-based + direct `created_by = (select auth.uid())`) to make this work for offline-synced inserts. Don't remove either policy assuming they're redundant — see `CLAUDE.md` for details.

## Deployment

See `documentation/zazi-izandi-fork-planv2.md` for the Phase 1-3 plan. Key operational docs for future port:
- **PRD.md** (to port from Masi) — full product requirements
- **LEARNING.md** (to port from Masi) — architectural decisions narrative
- **DATABASE_SCHEMA_GUIDE.md** (to port from Masi) — schema reference

Until those land, the approved plan (`~/.claude/plans/can-you-consider-this-polished-allen.md`) and the consolidated migration file are authoritative.

## Contributing

Branch off `main` once the app ships to EAs; pre-launch, direct commits to `main` are fine. See `CLAUDE.md` for project-wide conventions (commit discipline, bottom-sheet UX preference, Python-preferred backend, etc.).

## License

Proprietary — Masinyusane nonprofit.
