# Mobile navy and lime refresh

Linked audit: #58. Base: ef73dc0.

Owner requested reference-led retail details and order catalog, plus shared styling throughout the field app. Adaptation: real sync state, real location/next-visit/invoice data, configurable packaging and actual totals replace mock examples. Muted text is darkened for readability. Admin is excluded through mobile-shell selectors.

Catalog adds local search by variant, brand, product line and SKU, collapsible product-line filter, explicit empty state, product cards and sticky cart review. Existing quantity, checkout, draft and retry logic is preserved. Retail details adds native-disclosure navigation provider choices, contact and finance sections, actual recent invoices and store facts. No invented delivery/call events. Orders remains an invoice destination, rather than a misleading global Cart tab.

Validation: mobile and Admin builds; existing117tests; lint has four pre-existing warnings. Local browser synthetic catalog verified 0→half pack→1pack, $32→$64 totals, search/no-match, filter reveal, review Cash/credit4–10days, $0.0 collection and unpaid balance. No submit or live business mutations. This is a focused UI smoke check, not #58 full audit or iPhone acceptance.
