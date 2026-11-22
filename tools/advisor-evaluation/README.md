# M6 advisor evaluation (issue #14)

Read-only evaluation tooling, not a production AI service or scheduled delivery. Uses Python standard library only. No database client, credentials, network calls, posting or messaging exists in the evaluator.

1. Run `source-query.sql` through the owner's approved read-only database connection. Save only its `snapshot` object to a private JSON file outside Git. The single SQL statement fixes the source snapshot/time and independently checks per-invoice lines, cash, balances and reportable orders. Do not expose live output in public fixtures or PRs.
2. Run `python3 advisor_eval.py owner-snapshot.json owner-review.html`. It validates the period, source checks, freshness and candidate details, then produces a factual baseline and at most three review prompts. Invoice links target the existing authenticated Admin site.
3. Ask the owner whether the prompts add value beyond the factual table. Record Continue, Keep factual report, or Amend. #13 remains an upstream final-certification dependency.

Run `python3 -m unittest -v test_advisor_eval.py` for ten fixed-clock synthetic cases. `synthetic-fixture.json` contains invented records, not real customer data. Tests cover valid ranking/traceability, failed/missing source checks, net-zero unallocated events, stale/future clocks, zero data, unknown due dates, negative signed collections, duplicate/unsafe/unsupported candidates, detail-to-total reconciliation, maximum three prompts, due-today semantics and HTML escaping.

## Declared policies
- Asia/Baghdad; rolling seven calendar days including partial today, half-open date range. Current debt/overdue are snapshot balances, not historical period balances.
- Cash uses event time, sales use invoice issue time. Do not divide these unmatched cohorts to infer collection efficiency.
- Overdue first, then due reminders, then scheduled follow-ups within seven days. Within each group, largest current invoice balance first. This is a proposed human-review order, not an instruction to collect early or change credit terms.
- Require all four reconciliation checks; unallocated entries block prompts even if their signed net is zero. Candidate overdue totals and due-reminder count independently reconcile.
- Proposed evaluation freshness guard: 24 hours; source clock more than five minutes ahead blocks prompts. Both are reviewable evaluation settings, not business performance targets. Refresh the live snapshot before taking action.
- No prior comparable period, targets, causality, forecast, stock balance, risk score or automatic decision is inferred. No statistical sufficiency threshold is invented.
- Private report uses pseudonyms and owner-only invoice links. No contacts, location, notes, photos or cost catalogs are inputs. A report saved to disk is not automatically refreshed.

Do not use a synthetic fixture clock to represent current live data. Do not embed a service key or send snapshots to any external model/provider. Any future model integration, scheduling or delivery needs separate authorization and data review.
