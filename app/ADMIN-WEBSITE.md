# Separate admin website

The field PWA and owner admin website are independent applications in the same repository. Shared source avoids copying database logic; separate entries and build outputs keep the interfaces separate.

| | Mobile field app | Admin website |
| --- | --- | --- |
| Entry | index.html / src/main.tsx | admin.html / src/admin-main.tsx |
| Build | npm run build | npm run build:admin |
| Output | dist | dist-admin |
| Responsibility | Client creation, visits, orders, surveys and transaction receipts | Catalog/prices, record corrections, surveys setup, settings and reporting |
| Service worker | Field offline queue/capture | None registered |

## Vercel project setup
Create a **separate** Vercel project connected to this GitHub repository. Leave the existing mobile project configuration unchanged.

- Root directory: `app`
- Build command: `npm run build:admin`
- Output directory: `dist-admin`
- Install command: `npm ci`
- SPA rewrites are already in `app/vercel.json`. CLI deployments can alternatively use `app/vercel.admin.json` with `--local-config`.
- Configure the existing project's public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the new project's environment. No service-role key.
- Set `VITE_FIELD_APP_URL` to the mobile website origin in the admin project.
- After the admin address exists, set `VITE_ADMIN_APP_URL` in the mobile project and rebuild it. Missing configuration shows a clear handoff message rather than embedding the dashboard.
- Add the admin origin to approved Supabase authentication redirect URLs for password recovery. Sign-in and recovery remain owner checked. No tokens are transferred between websites.

Visit `/` on the admin origin to open `/admin`; all admin routes remain on that separate origin. Locally use `npm run dev:admin`, open `/admin.html`, then sign in (development uses the admin HTML entry explicitly).

## Data and access
Both sites use the same Supabase database and existing owner policies. No new staff role or policy is introduced. UI separation alone is not a new authorization boundary. Sessions, IndexedDB drafts and pending queues belong to each origin: each site requires its own login and sync; existing mobile drafts are retained on the mobile site. Do not move to a new mobile origin or clear storage as part of this release.

Invoice receipt/detail viewing on mobile supports recording an order; aggregate financial reports and management controls live only in admin. Supabase data is shared after successful sync; unsent device drafts are not falsely shown as shared.

## Release gate
This branch builds both apps. Vercel project creation/environment configuration and real browser/iPhone acceptance are separate evidence. Do not claim the admin website is live until its own URL is deployed and verified.
