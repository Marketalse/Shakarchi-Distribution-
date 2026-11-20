---
name: wsd-fmcg-financial-engine
description: Develop, validate and interpret operational FMCG finance metrics for the single-admin WSD Basic Retail project, including sales, receivables, collections, SKU and outlet gross margins, and pricing scenarios. Use for finance-related code, reports and tests; never use for autonomous posting or investment analysis.
---
# WSD FMCG Financial Engine V2

This replaces wsd-financial-analyst; do not maintain both. This is a coding-agent skill, not a deployed runtime service. Read root PROJECT_GOVERNANCE.md and FINANCE.md first; if they conflict with the actual schema or current approved brief, report the conflict before modifying code. Read the relevant files in references/ only as needed.

## Scope and permissions
Read PROJECT_GOVERNANCE.md before each finance task. Follow repository AGENTS.md for project tracking and file locations. Use only owner-authorized, read-only business queries or supplied verified aggregates. Never change live payments, invoices, adjustments, access policies or customer records through this skill. Never expose credentials or send unnecessary client personal information to an AI service. Do not assume that a table or view exists: inspect the current schema and test queries first. Keep the AI out of transaction logic.

## Analysis procedure
1. Confirm requested metric, period, comparison period and Baghdad-local reporting boundaries. Use stored timestamptz events and exact numeric/decimal calculations in the database; distinguish issue date, receipt date and adjustment date.
2. Obtain checked aggregates from the existing database. Use issued records only and preserve historic snapshots. Avoid join fan-out by aggregating invoice lines, adjustments and ledger entries separately before joining. Flag unallocated historic payments, missing costs, missing lines or unreconciled records. Never substitute zero for missing financial data.
3. Report metric values, source query/view, period, data coverage and caveats. Use deterministic SQL/application calculations, not mental arithmetic or model-generated totals. Reconcile sums against invoice-level records and test with known fixtures.
4. Explain at most three useful actions for the admin, supported by actual data. Clearly distinguish observations, assumptions and recommendations. Do not predict sales in V1.

## Metric definitions
- Net sales: issued line totals plus signed posted adjustments; disclose whether adjustment reporting uses posting period or invoice cohort. Never include draft amounts.
- Net collections: receipt amounts minus refunds and correction reversals, including replacement receipts once; use cash-event date. Do not subtract credit notes as cash refunds.
- Outstanding receivables: sum per-invoice max(adjusted total minus net collected, 0); do not offset overpayments across invoices. Report overpayments separately. For historical as-of reports, require historical ledger cutoffs rather than present-day balances.
- Overdue: outstanding on invoices with effective due date earlier than reporting date. Collection reminders due are a different measure, based on active scheduled reminders. Do not infer due dates from reminders.
- Gross profit: net sales minus corresponding adjusted cost of goods sold, only if cost snapshots and adjustment cost impacts are reliable; otherwise report unavailable or explicitly scoped known-cost subset.
- Gross margin: gross profit / net sales; undefined for nonpositive net sales.
- Average invoice value: adjusted sales for a defined invoice cohort / count of issued invoices in that cohort.
- Visit conversion: distinct eligible visits with issued orders / distinct eligible visits; exclude canceled empty starts; report started and completed separately. Never count order and survey at one shop stop as two visits.
- Period sales growth: (current - prior) / prior; undefined if prior <= 0. Use comparable periods.
- Customer concentration: client net sales / total net sales for same period; undefined for nonpositive total. Outlet/SKU gross profit is not full profitability without expense allocation.

## Acceptance examples (test fixtures, not live data)
- Invoice 100,000; credit 10,000; receipt 60,000; refund 5,000: adjusted total 90,000; net collected 55,000; outstanding 35,000.
- Invoice 100,000; receipt 100,000; credit 20,000: outstanding 0 and overpayment 20,000.
- Receipt 60,000; reversal 60,000; replacement 50,000: net collected 50,000. Retry must not duplicate entries.
- One eligible visit with both an order and a survey: one visit and one converted visit.
- Missing cost snapshot: gross margin unavailable, not 100%.
- Zero prior-period sales: growth unavailable, not infinity.

## Output
Period and data coverage | KPI summary in USD | Exceptions | Up to three prioritized actions | Source and reconciliation status. State when evidence is unavailable. Do not claim validation unless tests actually ran.

## V2 extensions
- For implementation tasks, inspect migrations 001/002 and later migrations, existing financial views, API authorization and test harness. Propose the smallest backwards-compatible change; reuse existing views and functions. Authorized code changes are distinct from live business-record writes, which this skill must never perform.
- Use references/kpi-formulas.md for gross-to-net, aging, volume and margin definitions; references/pricing-rules.md for read-only scenarios; references/financial-validation.md for release gates.
- Keep SQL as source of truth. AI receives only necessary owner-authorized aggregates; no client contacts, raw credentials or service-role key. No external finance API or extra runtime dependency.
- Report adjustment coverage, missing quantity or cost impact, and whether list-price snapshots exist. Never invent discounts, trade-spend accruals or costs.
- Defer full VPM, trade spend, stock valuation, DIO/DPO, three statements, full cash flow forecasts and multi-user features. Do not create tables for them in V1.
- Every change needs a governance verdict, metric definition, evidence, tests run and remaining blockers. Never claim installation, migration or runtime validation without evidence.
