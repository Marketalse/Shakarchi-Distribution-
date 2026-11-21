# FMCG contract release — #38/#52/#41

Owner authorized completion/release work on21November2026. Prior release: PR61/main e8dc136, migration014 live. This note records the concrete contract delta, not full visual/phone acceptance.

- Per-item selling_price copies existing per-item retail_price exactly; cost remains per-item. Default Half Pack5items; Pack2HalfPacks; Box10Packs, with positive integer SKU overrides. Existing carton metadata retained as reference, not assumed to mean the new Box.
- New API uses0.5Pack order steps, stores integer half-packs and exact half-pack unit selling/cost snapshots. Invoice display shows corresponding Pack price and quantity. Historical lines retain original quantities/amounts and display a legacy-unit label.
- Additive product_lines registry uses existing brand IDs and exact trimmed line names; products keep IDs. Classification guards remain. No price-tier registry or inventory ledger is introduced.
- Canonical v2 catalog/product/import/invoice APIs reject legacy keys and stale price/conversion intent. Legacy endpoints replay accepted requests exactly and reject new ambiguous writes with55000, which keeps old cached clients from deleting uncertain requests. Legacy columns remain for compatibility/history; do not remove them until old clients/imports are retired in a separate reviewed delta.
- New invoice snapshots include base/selected UOM, selected quantity, item price, pack/box definitions and brand/line identity. Future registry edits cannot change old invoices.
- Admin historical hierarchy aggregates frozen line totals for the selected issued invoice cohort. Missing historical labels have explicit buckets; duplicate/missing-line reconciliation errors withhold grouping.
- Sync uses an origin-wide Web Lock and online identity/profile verification. Commands freeze atomically and remain retained after rejection. These checks are not proof of real multi-session or iPhone acceptance.

## Verification
69 app tests, both builds and disposable001–015 regressions pass. Four existing lint warnings; large mobile bundle advisory remains. Live preflight confirmed99products and no active missing source price/line. No raw catalog, customer identity, amounts or credentials are published.

## Release/rollback order
Review and record source; apply015 atomically only on live014 with a short lock timeout and history fingerprint checks; verify catalog/view/RPC/access metadata; merge/release both frontends; verify canonical entries and exact commit. Refresh installed PWA without clearing pending storage. No blind SQL down-migration: preserve new snapshots/operations and retained legacy requests. If posting must stop, use a reviewed forward control change; never reverse issued amounts or rewrite old units.

## Remaining acceptance
Rendered screen audit unavailable: local browser startup failure; remote interaction refused by provider country policy. Do not claim screenshot/layout/complete route coverage. #58 stays blocked with Admin phase unstarted. #41 needs actual offline phone result and multi-session evidence. #10 template hold unchanged. #60 actual logo pending.
