# M5 operational reporting — first review slice

Issue: https://github.com/Marketalse/Shakarchi-Distribution-/issues/13
Baseline: main 2f9f382 (offline release PR65). No migration, access-policy change or financial write.

## M4 acceptance
On 22 November 2026 the owner confirmed the iPhone pilot passed and explicitly directed: “Close M4 field pilot; retain #58/#10 separately.” Issue #11 and M4 milestone 6 are closed. #58 remains open outside M4; #10 remains on owner hold. This is scoped owner phone acceptance, not agent-observed full screen audit or legacy/concurrent recovery certification under #41.

## Definitions
All dates use Asia/Baghdad. Today is one calendar day; week is the last seven calendar days including today; month begins on the first; all includes recorded dates through today. Tomorrow's boundary is exclusive.

| Measure | Confirmed source | Boundary |
|---|---|---|
| Visits recorded | Unique visits.id | checked_in_at in period |
| Visits completed | Unique visits.id | checked_out_at in period |
| Stores visited | Distinct outlet_id on completed visits | Completion in period |
| Open visits | Unfinished visits | All dates through today |
| Survey forms received | survey_runs | created_at in period |
| Market observations | market_observations | created_at in period; separate from forms |

An order and survey sharing one visit count once. Missing, duplicate, inconsistent or unlinked source records withhold operational metrics rather than display a false zero. No scheduled-coverage percentage, duration score, target, or inferred physical unit count is introduced. Offline timestamps may represent server receipt, not original field occurrence.

Admin refreshes every 30 seconds while visible and online, and on focus/reconnect/resume. Successful records survive a failed refresh with an error banner. Phone-only drafts are not visible in Admin until acknowledged by the server. Admin draft counters refer only to that browser. Multiple REST reads are not an atomic database snapshot.

Existing USD invoice sales, signed cash and current balance calculations remain. Financial periods use invoice creation for sales and receipt time for cash; outstanding is current/all-time. Historical snapshots and cents arithmetic are retained. Financial concurrency and broader acceptance remain under #12/#26.

## Verification and remaining gates
87 tests pass, including shared-visit counting, Baghdad boundaries, false/zero submissions, late offline arrivals, source guards, refresh lifecycle, and signed correction/refund fixtures. Mobile and Admin TypeScript/Vite builds pass. Lint has four existing warnings outside the changed reporting files. Live read-only schema/access/link/timestamp/invoice consistency preflight passes on migration 016; no business records written.

Full rendered browser verification remains blocked under #58. New Admin visual acceptance and real phone-to-Admin observation remain outstanding. M5 stays open; this slice is prepared for review, not a complete milestone certification. Survey templates remain held under #10.


## Production release — 22 November 2026
Owner requested finalization and authorized release. PR #66 merged as main a84c976bcb827dec8c2b3754e6c1c93d4da7e7db. Admin and mobile production deployments are READY on that exact commit. Public HTML/asset checks confirm both compiled apps target the same Supabase project and Admin contains the new reporting panel/refresh lifecycle/offline disclosure. Fresh87 tests and both builds pass. Live read-only016 checks pass; financial source rows are present and per-invoice signed cash, outstanding, overpayment, date/link and line-total consistency checks pass. No customer records or amounts exported or modified.

Signed-in dashboard rendering and observing a fresh phone upload are still awaiting owner sign-in; the site login page is reachable in the available Codex browser. This improves the old browser-launch block but does not complete #58. Wider finance concurrency/legacy gates under #12/#26 remain separate. #13 stays open for final acceptance.

Operational behavior: while Admin is visible and online, confirmed Supabase records refresh every30seconds and on focus/reconnect. While the phone is offline, pending work remains on that phone; automatic upload resumes when connectivity and the running app permit. Closing/suspending Safari cannot guarantee background uploads. A disconnected Admin shows cached last-successful data/errors, not an invented live feed.


## Signed-in verification completed — 22 November 2026
The owner signed in to the Codex browser. The live Admin overview rendered confirmed activity and financial metrics; Today selection changed the cohort correctly. Direct read-only source queries independently matched rendered weekly starts/completions/distinct stores/open stops, invoice/cash/current balance and Today totals. Last fetched advanced automatically without pressing Sync. Orders and an invoice detail rendered clean item/brand/category/quantity/price snapshots; Collections showed matching balances and history. Clients, Catalog, Surveys, Imports and Settings opened without reported errors. Captured browser error log was empty. Local screenshot retained outside Git.

This supersedes the earlier awaiting-owner-sign-in statement. Existing phone-entered records are visible in Admin; no new financial transactions or business data were created by the agent. A fresh physical-phone submission was not performed during this check. Full #58 screen/state audit and wider #12/#26 legacy/concurrency acceptance remain open. Current dashboard implementation/release and its read-only data connection are verified; #13 remains open for broader financial milestone acceptance.
