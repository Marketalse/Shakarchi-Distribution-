# Shared retail-name reference

Owner request24November2026: use the retail name as a recognizable common tag for payments, visits and collections. Related #81/#82. Baseline00c3042. Verdict: adapt as a display identity, never a replacement for relational keys.

## Rules
- Current stored retail name is the operational label across related records.
- Use the historical recipient name only when the current retail cannot be found. Do not modify the issued invoice's original Bill to, share content or snapshot.
- Same-name directory records show area/province when available. If both name and location are identical, names remain non-unique; invoice numbers and correctly bound links still distinguish records. No automatic merge or new unique-name constraint.
- Missing names use Retail unavailable; UUID values are not used as display fallbacks.
- A linked payment resolves via its invoice's retail; conflicting stored retail IDs produce an explicit review label. An unallocated payment can show its stored retail name while remaining unallocated to an invoice.
- Receipt dropdowns retain original ID values, using retail name/receipt ordinal/amount/time as visible text. Ordinal is local presentation, not a persisted receipt number.

## Surfaces
Manager invoice/collection registers, collection/reminder detail, receipt selector, cash history, field activity and follow-up cards. Mobile operational invoice list/detail context, customer payments/visit workspace, legacy visit context/history and overdue panels. Shared RetailTag rendering and pure reference resolver; duplicate area context is available when the calling surface has the directory, otherwise the known-customer screen retains its own location context.

Existing payments.outlet_id is added to the Admin read projection so cash without an allocated invoice can still identify the customer. No migration, financial aggregation, posting payload, access policy, operation identity or stored foreign-key changes.

## Verification
139tests pass, including8identity cases covering Arabic/duplicates, unchanged historical snapshots, missing-current names, UUID fallback suppression, cash entry types, unallocated payment retail attribution and mismatched identities. Mobile/Admin builds pass; four existing lint warnings. Shared-component synthetic browser preview at390px renders Arabic and location labels with no horizontal overflow or captured console errors. This is a focused display check, not full signed-in production/iPhone acceptance. No live business mutations.
