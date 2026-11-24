# Customer visit workspace

Owner approved24November2026 under #82, with related Manager context under #81. Baseline0fd1745. Verdict: adapt relationship context and visit preparation without changing financial or capture protocols.

## Mobile
Customer Summary becomes Visit workspace, with prepare/capture actions, customer contact, last confirmed completed visit, local unfinished work, all unpaid invoices with overdue distinction, balance snapshot dates and recent invoices. Payments is a read-only customer tab; opening Summary/Payments does not create a visit. Existing Order, Survey forms, legacy Survey and Profile remain reachable. Original store details, Next Visit and full invoice history remain in an expandable section. No new order-request, credit-balance or receipt workflow.

Capture buttons enter the existing flows. Owner-bound local sessions, drafts, pending invoice request and published form references are read without altering them. Source rows use existing confirmed snapshots or owner-bound cached reads. Unavailable history/financial sources do not become zero. Snapshot dates are shown; freshness is not implied. Visit history becomes available offline after initial online read; it is not globally prefetched to every phone.

Unpaid/overdue calculations reuse clientDebt and exact money helpers. Due today is not overdue, missing dates remain unknown and no credit offset is introduced. Invoice totals, FX, packaging, collections, server contracts and historical records are unchanged. New metadata caches are read caches only, not financial postings.

## Manager
Customer relationship panel adds stored contact, confirmed completed visits/last visit and received form count using the existing Admin data loader and owner gate. Existing field event timeline, invoice context and editable profile/location remain. Counts are confirmed uploads, not unsent phone work.

## Verification
131tests pass, including8new tests: exact unpaid/overdue distinctions, duplicate invoice rejection, completed visit selection, invalid chronology rejection, owner-bound offline snapshots, unavailable offline source rejection, cross-owner denial, and unchanged local drafts/sessions/command counts on readiness read.

Focused synthetic mobile browser: 390px layout without horizontal overflow, payments-only view with overdue and future-due invoices, unavailable-history state, order/survey callback actions and no captured console errors. Fixtures are not production records and are removed from release source. No invoice/payment/survey submission occurred. Manager panel compile/build verified; live signed-in cross-surface and iPhone acceptance remain pending, as does #58.

No migrations, new dependencies, access changes or financial posting changes. Broader #81/#82 remain open for owner review and future scoped work.
