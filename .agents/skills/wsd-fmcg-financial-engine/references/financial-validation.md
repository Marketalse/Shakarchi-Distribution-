# Validation and release gates

1. Inspect schema and constraints; map actual fields to canonical definitions. Do not assume proposed tables already exist. Check owner-only access for table/view/function/storage; unauthorized and anonymous must fail. No service-role key in browser.
2. Reconcile issued lines, signed adjustments and signed ledger separately per invoice; prevent join multiplication. Flag missing lines, unallocated payments, duplicate operations, invalid costs, missing due dates and unmatched legacy rows. No silent fixes.
3. Run repository tests on a disposable database, including simultaneous posting and retry invariants, historical snapshots and migration compatibility. Report actual commands and results. No production migration through this skill.
4. Confirm dashboard and report totals agree with same definitions, filters and reporting cutoffs. Do not present unverified aggregates as live facts.

## Required fixtures (USD; expected results)
| Scenario | Expected |
|---|---|
| 100,000 issued, 10,000 credit, 60,000 receipt, 5,000 refund | total 90,000; net 55,000; outstanding 35,000 |
| 100,000 issued, 100,000 receipt, 20,000 credit | outstanding 0; overpayment 20,000 |
| 60,000 receipt, 60,000 reversal, 50,000 replacement | net 50,000; duplicate operation no extra posting |
| 10 units × final price 900, list price 1,000 | issued sales 9,000; discount 1,000 only once |
| 10 units × cost 600, price-only credit 1,000 on 9,000 sales | net sales 8,000; COGS 6,000; GP 2,000; margin 25% |
| 10 × 900, 10 × 600 cost; verified return 2 units with credit 1,800 and cost reversal 1,200 | net units 8; net sales 7,200; COGS 4,800; GP 2,400 |
| Cost missing or return cost impact unknown | complete GP unavailable |
| Cost 750, target margin 25% | proposed net price 1,000 |
| Outstanding 20,000, no due date | unknown aging; not counted as overdue by assumption |
| Due date equals reporting date | not overdue yet |
| Two lines, two payments, two adjustments | aggregate separately; no fan-out |
| One shop stop with invoice and survey | one eligible visit, one converted visit |
| Zero prior sales, zero net sales or zero units | corresponding ratio undefined |
| Event at Baghdad midnight | included in new local day, excluded from previous day |
| Refund on settled invoice | reopen balance; new four-calendar-day reminder if positive; retry safe |

These are acceptance specifications, not evidence that live tests passed.
