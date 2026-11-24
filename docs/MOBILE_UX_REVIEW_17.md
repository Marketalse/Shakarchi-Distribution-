# Mobile UX review —17 observations

Related #91; scoped implementation against main5abbf89. Owner clarified: tags include brand/type/stock; alternate cards means two per row. Brief verdict: approve/adapt within existing solo field workflows. Independent tester account/access work in #89 is unchanged.

| Owner item | Result |
|---|---|
|1 Small upper-right tag | Compact brand, explicit DTL/MTL and stock tags. Stock says **not tracked** because inventory is not implemented. |
|2 Order refresh jumping to top | Client/catalog loaders retain existing data for the same identity during background sync. The mounted form/cart is preserved; a different customer never receives the prior customer's details. |
|3 Two-product view | Persistent List /2columns control. Half-pack buttons retain44px touch targets even at320px. |
|4 Automatic SKU | Removed the editable SKU input. New product gets an automatic UUID-derived SKU; existing IDs and frozen pending create requests retain their identifiers; successful create resets the form. No migration or historical identifier rewrites. |
|5 Submission feedback | Brief Thank you / order number status only after server acceptance. No false confirmation while queued. |
|6 Brand vs DTL/MTL | Brand filters remain brands; separate labelled product-type selector and card tags explain DTL/MTL. No type guessed when master data has no explicit token. |
|7 Larger filled left photo | Larger128px square list photo, centered left; grid photo fills card width. Cover fit fills the frame; Admin preview matches. Non-square originals can crop at edges, so review the image preview. |
|8 Card spacing |8px catalogue gaps and compact card padding. |
|9 Remove Admin shortcut | Field User page no longer links Open Admin website; mobile invoice details no longer link collection administration. Backend/sync connection unchanged. Direct legacy Admin routes remain a controlled handoff for compatibility. |
|10 Client list | Larger customer name, hidden attribute tags/type, one right-side map button opening Google Maps/Waze choices using the saved location. |
|11 Lottie login/no corner brand | First-party vector Lottie animation loaded locally, without expression/eval runtime; reduced-motion support and static fallback. Removed top-left brand label and mobile wordmark. |
|12 Responsive layouts |320/390/430px portrait and740px landscape checked for no horizontal overflow. Keyboard/errors/large text may scroll rather than clip; no claim of testing every physical device. |
|13 Centered login | Compact centered form;320×568 app content fits one viewport in the configured fixture. Offline/unconfigured error messages and keyboard remain scrollable for accessibility. |
|14 Login→Home | Successful sign-in navigates Home; installed PWA start URL is/dashboard. Existing deep-linked flows remain accessible. |
|15 Home order/survey | Create order & survey button selects a customer and opens Order; survey follows confirmed order. |
|16 Close order→survey | Direct result and queued acknowledgment use one guarded completion path; clear accepted draft then show published survey forms. Empty form setup is not replaced by invented questions. |
|17 Shareable document | Confirmed invoice record generates a real PDF, available from the confirmation and invoice details. Native Share PDF appears where file sharing is supported; Download PDF always available after preparation. Unpaid invoices are not proof-of-payment receipts. |

## Financial and delivery boundaries

No SQL, access grants, prices, unit math, immutable snapshots or posting APIs changed. PDFs use frozen invoice line snapshots and latest available balance data; offline exports can reflect the last sync. They render Unicode/Arabic via browser canvas into A4 raster pages, so text is not selectable. No data goes to a PDF service. A customer is chosen by the user through the system share sheet; no automatic sending. If offline data lacks the confirmed invoice/items, sync is requested instead of inventing a receipt.

The PDF renderer, Lottie player and dependencies are bundled/dynamically loaded. Four moderate npm audit findings are in the existing PWA/Workbox/glob/minimatch toolchain; no broad dependency downgrade/force fix was applied. Existing large-entry-bundle and four pre-existing lint warnings remain; Lottie light build avoids its expression eval warning.

## Validation

-157 app tests pass; mobile/Admin builds pass; no new lint warnings.
- React/fake IndexedDB regression: repeated sync-version changes keep the same mounted product card and half-pack quantity.
- Direct-response/background-ack race: pending UI never says success, acknowledgment triggers one confirmation/survey, late duplicate response has no second effect.
- SKU tests preserve existing/frozen identifiers; explicit category-token tests do not infer a type from brand names.
- Synthetic browser: grid and quantity controls at320/390/430px; client map chooser right alignment and saved fictional destination URLs; Lottie SVG present; no captured console errors. Login app height568px in320×568 configured fixture, no horizontal overflow. Landscape740px checked.
- Browser-generated32-line Arabic sample PDF validates as3-page A4, no embedded JavaScript. First/last pages rendered with Poppler; readable names, whole normal item rows, correct$2,048 total/$0 collected/$2,048 unpaid balance. Browser download-event automation stalled; file inspected via visible fixture export instead. Physical iPhone file-share-sheet acceptance remains pending.
- Disposable database001–017 suite is rerun for financial baseline compatibility; it is not live concurrent-session proof.

No synthetic records, images, PDFs or credentials are published to production or public source. Temporary preview pages are excluded from release.

## Owner retest

Refresh/reopen the app to receive the new service worker. Test Home→Create order & survey→customer→List/2columns→DTL/MTL→quantity→Review. Let a background sync run while scrolled; confirm cart/position stay intact. Submit only intended orders; confirm one thank-you, survey handoff, and correct PDF status. Share a PDF manually on iPhone and report any device-specific problem. #91 awaits this phone acceptance; #58 full screen audit and #89 separate-account beta remain open.

Implementation references: [Lottie loadAnimation](https://github.com/airbnb/lottie-web/wiki/Usage), [jsPDF API](https://parallax.github.io/jsPDF/docs/jsPDF.html).
