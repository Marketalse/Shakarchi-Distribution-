# Refined mobile UI — issue #54

Date: 21 November 2026. Parent: #43; milestone M3A.

## Source and approval
Owner requested the mobile updated-designs handoff. Figma MCP context and screenshot calls hit the Starter usage limit. Owner explicitly approved using local build-design.js and assets instead. The script was read as design input, never executed. Existing operational requirements take precedence over sample prototype content.

## Delivered source
- Scoped light mobile theme, rounded cards and fields, floating Solar navigation, supplied 3D illustrations, login/recovery layouts and account menu.
- New compact USD overview reuses existing exact-money reporting, real daily sales and reminders. Today uses Baghdad dates. Detailed reporting remains reachable at /reports.
- Client directory has initials, search/count and saved Google Maps/Waze links inside each card. Client detail has explicit order/survey actions.
- Existing order, invoice, survey and client forms use the new visual system; product cards display the existing flavour rather than internal tracking SKU. Stored identifiers and historical snapshots unchanged.
- Existing responsive admin workspace handles catalog, collection, reminder, survey-builder and import operations. No duplicate admin module created.
- Supplied assets copied unchanged with attribution. WebP illustrations included in PWA precache. No new dependency or migration.

## Contract boundaries
USD ledger/transaction calculations unchanged. Owner gate, durable queues, shared visits, capture-once GPS, admin correction and service-area choices retained. No sample IQD totals, fictitious metrics, fake device chrome, invented file export, new survey field types or staff role introduced. Pack-price/UOM implementation remains #38; taxonomy review #52 remains separate.

## Validation
56 app tests pass, including Baghdad today boundary/future-row exclusion/prior debt preservation. TypeScript/Vite production build and diff whitespace checks pass. Lint reports four pre-existing warnings in useSync, BasicRetail and CaptureForms; no new warnings. Source assets verified byte-identical; generated service worker includes illustrations. Build retains existing large-entry-chunk advisory.

## Remaining acceptance
Visual browser/screenshot checks and real iPhone Safari review are NOT completed. Automated test Chrome process 82777 aborted in macOS HIServices application registration before loading the app; the supplied crash report matches that test process. No further browser launch attempted. No production records changed. #41 offline/device gate and #47 native navigation handoff remain open.

Review: [PR #55](https://github.com/Marketalse/Shakarchi-Distribution-/pull/55).

Status: source ready for review; #54 remains open until visual acceptance. Production not updated by this branch yet.


## Owner clarification superseding reporting layout
Issue #56 / PR #57 replaces the mobile financial overview with field capture tasks/counts and moves all management/reporting to the standalone admin website. The original financial overview notes above describe the earlier design iteration, not the final release. See [Standalone admin](Standalone-admin.md).
