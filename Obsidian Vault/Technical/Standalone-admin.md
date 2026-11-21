# Separate admin website and field capture app — #56

21 November2026. Owner corrected the earlier route-only interpretation: admin is the sole place for control and reporting; mobile is for data gathering. Verdict: adapt the existing dashboard into an independent application, reusing its modules and database contracts.

## Implemented
- Independent `admin.html` / `admin-main.tsx` / `AdminApp` entry, login and owner gate, `build:admin` output in `dist-admin`, separate Vercel configuration. No mobile shell or PWA worker registered by admin.
- Mobile build no longer imports the dashboard or exposes aggregate financial reports/profile editing. Its home shows field actions and local capture counts. Operational invoice receipts remain part of order capture.
- Legacy mobile /admin and /reports links hand off explicitly to the configured separate website. Cross-site links preserve only invoice/search identifiers; never auth tokens. Both sites require separate sign-in.
- Shared Supabase and existing owner checks/RLS remain; no new staff roles, SQL, dependencies or production records. Browser sessions and unsent drafts remain origin-specific. Mobile origin/storage are preserved.
- Deployment settings and authentication redirect checklist: app/ADMIN-WEBSITE.md.

## Verification
58 tests pass including cross-site origin restrictions and auth-token stripping. Both TypeScript/Vite builds pass. Output inspection confirms admin dashboard text absent from mobile, present in admin, separate root HTML and no admin service worker. Four pre-existing lint warnings remain. No new browser launch after the earlier macOS Chrome crash; authenticated visual/device acceptance is not claimed.

## Release
Branch feature/standalone-admin is based on the pending mobile design PR #55 to preserve those changes. Separate PR targets that branch; merge/review order is #55 then this separation. #56 stays open until deployment and sign-in acceptance. Vercel connection is available but its API returned403 for the Shakarchi team; team consent is required before creating the separate Vercel project. Do not change current mobile production until handoff address is configured.

Review: [PR #57](https://github.com/Marketalse/Shakarchi-Distribution-/pull/57). Local admin /, /admin and /admin/clients returned its independent admin entry (HTTP200). Vercel confirmed user still needed to select the Shakarchi team; deployment waits for completion of that consent step.
