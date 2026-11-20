# WSD finance conventions (V2)

- Canonical currency USD; PostgreSQL exact numeric/decimal, never binary floating point for money. Preserve existing precision/scale after inspecting schema; define rounding at posting boundaries explicitly. Do not introduce an assumed tax regime.
- Events stored as timestamptz; reporting uses Asia/Baghdad, half-open [start,end) ranges. Calendar month is default reporting period, not a declared fiscal year.
- Issued orders and signed adjustments are separate from cash receipts/refunds/reversals. Preserve invoice snapshots and existing invoice_no. No draft revenue. Never mutate issued amounts.
- Report sales by issue/posting events or explicitly label invoice-cohort reports; collections by cash ledger event dates. Historical balances need as-of cutoffs and historical due-date state where aging is requested.
- Distinguish outstanding, overdue and reminder-due amounts; overpayments separately. Missing due date = unknown aging, not overdue or current by assumption.
- Gross profit is not net profit. Missing costs or adjustment cost impacts block complete profit metrics. No fabricated overhead or trade promotion estimates.
- See .agents/skills/wsd-fmcg-financial-engine/references/ for definitions and tests. All thresholds and target margins are admin inputs, not imported defaults.

## USD and local-cash settlement

- Migration 008 sets USD-only canonical prices, invoices and payments. Do not reapply the cutover to populated tables.
- Manual parallel rates use IQD per USD, versioned with source, publication time and expiry. No official-rate fallback or automatic feed is enabled.
- Local IQD cash is settlement evidence: convert once at posting, round to USD cents, and preserve the immutable rate/amount snapshot. USD debt and historical margins are not revalued when the rate changes.
- Receipt corrections preserve the original local rate; new collections/refunds follow the approved settlement policy. Replay uses the same operation UUID and payload.
- FX snapshots preserve accounting evidence; they cannot guarantee zero economic FX loss. No historical currency conversion is implied.

## Existing database

Keep migrations 001/002 as the baseline. Reuse generated order line totals, historical unit cost, signed payment amounts, invoice numbers and security-invoker views where their semantics match. The current outlet balance can net invoices and unallocated cash. It is unsuitable as the V2 receivables KPI, which must floor each invoice individually. The current overdue view uses the database session date. Apply an explicit Baghdad reporting date in future reporting. The existing next-visit field is independent of collection reminders.

Treat the [solo database design](Obsidian%20Vault/Technical/WSD%20Solo%20database%20design.md) as a design baseline. See [V2 formulas](.agents/skills/wsd-fmcg-financial-engine/references/kpi-formulas.md) for calculation boundaries and [the review](Obsidian%20Vault/Technical/Finance-engine-V2-review.md) for implementation gaps.
