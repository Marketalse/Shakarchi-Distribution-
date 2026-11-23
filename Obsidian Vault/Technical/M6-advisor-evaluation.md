# M6 weekly advisor evaluation

Issue #14 · In Progress · Owner authorized the start on22November2026 while #13 remains open. This is a bounded read-only evaluation, not a new production advisor deployment. Verdict: ADAPT — compare a simple factual report with traceable deterministic review prompts before adding a model/service.

## First weekly question
Which collection follow-ups deserve the owner's attention? This is a proposed starting question using the already verified reporting subset. The owner can change it during usefulness review.

## Inputs and sources
M6.Q1 is a single read-only SQL snapshot from solo_invoice_balances, order_lines, payments, orders and collection_reminders. It captures source timestamp, migration head, timezone and period boundaries. The rolling seven-calendar-day period includes partial today. Period sales use invoice issue dates and period signed cash uses cash-event dates. Current receivables, overpayments, overdue and unknown aging remain snapshot balances.

Checks independently compare invoice lines and signed cash per invoice, current balance formulas and reportable orders. Candidate overdue totals and due-reminder counts reconcile to their aggregates; unallocated entries block advice even if signed net is zero. Live output stays private and outside Git. Inputs omit contacts, locations, notes, photos and full catalogs. Pseudonyms and authenticated invoice links support owner review without exporting client identity.

## Factual versus advisor comparison
A: factual totals with field-level source references and reporting dates. B: up to three distinct invoice review prompts with candidate references and owner-only invoice links. Proposed order: overdue, then due reminders, then upcoming scheduled follow-ups, sorted by current balance within each class. A future reminder is not evidence that payment is overdue. No posting, rescheduling or customer messaging occurs.

The first owner-private snapshot passed all source checks and produced supported prompts. Its private HTML contains the actual baseline and suggestions; no live figures are published here. The numerical output is deterministic; no external AI model/service is integrated. Draft value must be judged by the owner, not assumed from test success.

## Required limits
No growth, collection-efficiency ratio, credit score, forecast, profit statement or causal conclusion without compatible sources. No claim that an empty report means healthy performance. Unknown due dates remain unknown. Data on unsynced phones is excluded. Old/future-clock snapshots and failed reconciliation withhold prompts. Proposed 24-hour freshness/five-minute future-clock guards are evaluation settings for owner review, not new sales/finance targets.

M5 #13 and broader #12/#41 acceptance remain open. #10 stays on owner hold. #26/#62 accepted scope remains closed; #62 implementation is deferred. Full accounting #69 and the full screen audit #58 stay separate.

## Evaluation cases and evidence
Ten fixed-clock synthetic tests pass: traceable ranking, failed/missing reconciliation, offsetting unallocated events, stale/future clocks, zero data, unknown due dates/negative cash, duplicate/unsafe/inconsistent candidates, aggregate/detail mismatch, maximum three suggestions and due-today semantics, exact values and HTML escaping. Live016 source checks pass. Local browser rendered both baseline and recommendations and captured no console errors. Private screenshots remain outside Git. No application code, schema, live finance records or permissions changed; no dependency/model/service installed.

## Owner usefulness rubric
| Check | Required evidence |
|---|---|
| Accuracy / traceability | Every amount/date matches its accepted source, cohort and timestamp. Any unsupported claim requires amendment. |
| Actionability | Is the client/invoice link useful and is the suggested review appropriate to overdue vs future-due status? |
| Added value | Does B help choose a next step more quickly than reading A alone? |
| Decision | Owner records Continue, Keep factual report, or Amend, with an example if needed. |

Pending: owner acceptance of the weekly question and usefulness/continue decision. Final M6 certification remains linked to #13. No automatic rollout, recurring job or external delivery follows from this draft.
