# M5 current aging and invoice gross profit

Owner approved the reporting sequence on 22 November 2026. Parent #13; new implementation #68; regression follow-up #26; legacy finance/concurrency #12 remains separate. Verdict: APPROVE/ADAPT — reuse exact USD records and frozen costs without expanding the ledger. Full accounting is [separately scoped](Accounting-expansion-scope.md).

## Current receivables
Collections shows not due (including today), 1–30, 31–60, 61–90, over90 days overdue, and unknown due date. Dates use Asia/Baghdad; bucket sums reconcile to current per-invoice outstanding. Positive overpayments remain separate and never offset another invoice. Invalid/duplicate invoices withhold aging. Open-invoice details link to client and invoice. This is current aging, not historical as-of reconstruction.

## Invoice-cohort gross profit
Overview uses the selected Today/last7calendar days/calendar month/all recorded dates through today cohort. Sale line COGS = stored integer quantity × immutable USD unit_cost. New half-pack contracts already store quantity/cost in matching units; no second packaging multiplication occurs. Per-invoice line revenue must reconcile, including individual quantity/price math. Gross profit = cohort invoiced sales − corresponding recorded COGS; margin = gross profit / invoiced sales, undefined for nonpositive revenue. Negative profit remains negative.

Missing costs, unproven historical currency or unsupported line metadata make the affected aggregate unavailable, never zero-cost. Legacy return rows withhold complete COGS/profit pending verified cost-impact evidence. Product/client groups disclose the same boundaries and missing evidence. Complete groups do not imply a complete overall total. Frozen descriptions group historic rows; current catalog prices/costs never rewrite past results. Receipt/refund/correction events affect collections, not invoice revenue. No invoice adjustments, stock-return cost reversals or full net-profit feature is invented.

## Security and compatibility
Admin-only read-only UI using existing owner access/RLS. Loader selects existing line columns; no migration, money write, rate change or new runtime dependency. Mobile capture and shared database transport remain unchanged. Legacy direct finance uploads continue to reject unknown original currency/operation identity; no rows deleted.

## Verification
98 app tests (aging boundaries/Baghdad midnight, unknown dates, frozen costs, half-pack quantities, currency gaps, unsupported return costs, negative/zero margins, per-invoice offset errors and legacy direct-write denial). Both app builds and existing disposable001–016 database regressions required before review. Live read-only016 preflight validates source columns, line math, per-invoice line/cash balances; private amounts never enter public evidence. Real independent PostgreSQL sessions are unavailable locally; PGlite single-session tests do not certify concurrent posting. Unknown older device queues are not guessed or converted.

Release/deployment and rendered acceptance evidence will be appended after verification. #13/#12 are not automatically closed by this reporting addition. #62 own-performance and #58 full audit remain separate.
