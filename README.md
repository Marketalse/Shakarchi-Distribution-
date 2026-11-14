# Shakarchi Distribution

One app for field sales and market visibility, built around the shop visit:
check in, survey, order, collect. An AI advisor reads the data later.

## Stack

| Layer | Tool |
|---|---|
| Field app | PWA, hosted on Vercel |
| Database, logins, photos | Supabase (Postgres) |
| Scheduled jobs | n8n on Render |
| Dashboard | Power BI |
| Alerts and briefs | Telegram |

## Layout

- `supabase/migrations/` — database schema, applied in order
- `app/` — the field app (added in milestone M3)

## Rules that must hold

1. Offline first: a visit saves with no signal and syncs later without duplicates.
2. One outlet, one ID.
3. Money is append-only: orders and payments are never edited or deleted.
4. A rep sees only their own outlets; the owner sees everything.
5. The database calculates; the AI explains.
6. A visit takes under three minutes.

Project plan, blueprint and system design live in the Notion project hub.
