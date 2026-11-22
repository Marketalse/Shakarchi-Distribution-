# M6 owner advisor connection — #14

Owner authorized building and connecting the advisor on 22 November 2026, expanding the previous evaluation-only scope. This supersedes the old no-runtime/no-new-dependency restriction for this bounded integration. #13 remains open and blocks final M5/M6 financial certification; this is a collections pilot, not complete accounting or forecasting.

## Flow
Admin /admin/advisor → same-origin POST /api/advisor → online Supabase JWT verification → active owner profile under existing restrictive solo-owner RLS → read-only USD source fetches → deterministic reconciliation → anonymous candidate signals → Vercel AI Gateway / OpenAI gpt-4.1-mini → strict source-ID validation → locally rendered facts and source links.

The model receives only ephemeral C-number IDs, urgency classes and outstanding-balance rankings. Exact amounts, dates, database IDs, customer names/contacts, notes, GPS, photos and catalogue data are excluded. The owner confirms sharing before each brief. No secret or provider credential is bundled into the browser. @vercel/oidc is the sole new runtime dependency and retrieves a fresh deployment identity per provider request. No service-role key is used.

## Controls
- ADVISOR_ENABLED=true on Admin only; default disabled means 404 on the Field deployment.
- POST, owner JWT verification, same-origin check when Origin is present, no CORS, no-store responses, strict small request fields.
- Read source evidence without a model call; test connection with synthetic records only; generate an owner-requested brief with anonymous signals only.
- Fail closed on missing USD invoice evidence, duplicate rows, unmatched lines, per-invoice cash differences, invalid balance math/date/currency or even net-zero unallocated cash entries. Each source is bounded at 10,000 rows; exceeding pilot coverage withholds advice.
- Exact USD cents remain BigInt deterministic arithmetic. AI returns only up to three known source IDs, never executable tools, arithmetic or prose. Application renders fixed factual review text and source values.
- Data is fetched per request, not automatically sent every dashboard refresh. No AI request enters the mobile offline outbox. Last displayed evidence is stale after 15 minutes; AI suggestions are hidden until regenerated. Unsynced phone drafts are excluded.
- Provider request timeout20s, overall client timeout55s, function max60s, max150 output tokens, no automatic retries. Per-instance owner cooldown60s is a pilot guard, not a durable global spending cap. Use Vercel account budgets before broader rollout.
- No autonomous posting, record mutation, customer communication, credit-risk verdicts, forecasts or arbitrary SQL. No ZDR guarantee is claimed. Provider/account policies apply to the anonymous signals sent.

## Honest limitations / acceptance
Multi-table fetches are reconciled but not an atomic database snapshot; open the invoice again before acting. The pilot sorts at most30 eligible candidates by urgency then balance. Unknown due dates are excluded unless a pending reminder is due. Feedback is session-only and is not an accumulated KPI dataset. This integration does not claim measured advisory accuracy or business lift.

Useful evaluation: source-link validity, exact-number fidelity, rejection of invalid evidence, unauthorized-access denial, provider success/latency, owner usefulness versus source-only baseline. Final acceptance requires actual runtime/provider evidence and owner review, not only green builds. #14 stays open until that evidence and a continue/defer decision exist.

## Verification
117 tests pass (including12 advisor cases); Admin and Field production builds pass. Lint has only four existing warnings outside the new code. New tests cover owner/anonymous/cross-origin behavior, strict requests and consent, no model call for snapshots, synthetic-only connectivity tests, privacy minimization, fabricated model sources, financial inconsistencies, Baghdad dates and rate limiting. Deployment/runtime acceptance is recorded separately.

## Rollback / dependencies
Disable ADVISOR_ENABLED on Admin and redeploy, or roll back its deployment. No database migration or financial data rollback is required. Upstream: #13 metric acceptance, existing USD invoice/payment/reminder contracts, #12/#41 recovery limitations. Downstream: advisor evaluation #14, screen audit #58. Re-open advisor verification after any source schema, pricing/UOM, RLS, balance-view or reporting-contract change. Record trigger, impacted files/tables, required delta and re-verification evidence.
