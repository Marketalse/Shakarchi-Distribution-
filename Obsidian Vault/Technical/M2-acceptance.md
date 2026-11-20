# M2 database/access acceptance

Reviewed 20 November 2026 for [#8](https://github.com/Marketalse/Shakarchi-Distribution-/issues/8). This closes the original 001–012 database/access/catalog-boundary verification task. It does not close or implement the separate pricing proposal #38 or the field pilot.

## Verified

- Live and source migration versions match 001–012.
- One valid pinned owner; public signup disabled. Public base tables have RLS enabled; checked constraints are validated. Checked sensitive RPCs do not grant anonymous execution.
- Anonymous HTTP reads of protected products, profiles and invoice-balance endpoints return empty rows. HTTP 200 with no data is distinguished from an HTTP permission error.
- No missing/duplicate SKUs, contradictory brand classifications or non-USD product records. Inactive unpriced records remain inactive, excluded from orderable selection, with missing prices preserved as null.
- Own/competitor boundaries, foreign-key/validation behavior, retry identity, owner/nonowner isolation and immutable history pass the disposable migration regression suite through 012.
- 40 app tests, production build and lint pass; pre-existing bundle/effect warnings remain.
- Current tracked-file checks found none of the tested secret/private-key/service-role-JWT signatures and no private export/backup files. This is not a full-history secret audit.
- Read-only live verification made no business-record changes. Existing invoice line snapshots, amounts, IDs and policies remain intact. No new SQL migration was generated or applied.

## Related work

#21, #23 and #24 were completed with their linked merged releases. #29 was completed on owner phone confirmation. The Google Maps/Waze chooser is delivered separately under #37, with a keyboard/touch-compatible Navigate disclosure, HTTPS links and no GPS capture or API key. Deployment evidence is recorded in #37 before closure; native Waze handoff is not claimed tested on a phone.

#38 remains unimplemented. Latest owner arithmetic uses one per-item cost/selling-price source and derived 5-item Half Pack, 10-item Pack and 100-item Box displays, with SKU exceptions. No pack/cart repricing or retail_price rename is applied to the existing vape sales catalog. Changing imagery does not change the underlying catalog's product scope.

Poor-signal phone acceptance, legacy financial queue reconciliation and genuine PostgreSQL multi-session staging checks remain under the existing downstream #9/#11/#12 tasks. PGlite is single-connection and cannot prove those concurrency scenarios. Full M2 milestone completion must not be inferred while #38 remains open.
