# Decisions and risks
| ID | Decision pending | Owner | Gate |
|---|---|---|---|
| D01 | Confirm minimum capture fields and pilot access. Forms first, survey second is directed by the owner; V2 stays separate | Sponsor | M1 |
| D02 | Confirm SKU identity, input owner, outlet types and survey fields | Sponsor / field | M1 |
| D03 | Approve allocation, credit terms, refunds, correction and invoice rules | Finance / sponsor | M1–M2 |
| D04 | Decide BI access, advisor provider, recipients and spend | Sponsor / analytics | M5–M6 |

| Risk | Control | Owner |
|---|---|---|
| Duplicate outlets or retries | Canonical IDs, dedupe review and replay evidence | Builder |
| Money drift or unauthorized records | Reconciliation, append-only records and access review | Finance / reviewer |
| Pilot too small or slow | Time visits, capture failures, extend pilot where needed | Field |
| Thin or misleading advice | Report source count and missing data; keep human review | Analytics |
| Internal data exposed in public repo | Keep operational inputs private; use synthetic examples | Maintainer |
