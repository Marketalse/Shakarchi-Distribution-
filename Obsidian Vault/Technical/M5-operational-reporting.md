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
