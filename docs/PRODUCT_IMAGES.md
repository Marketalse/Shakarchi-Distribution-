# Product images and catalogue card

Related: #81 (Admin), #82 (Mobile), #58 (regression audit).

The approved design #2 uses a large product photo on the left, product identity and pack price on the right, and the existing half-pack stepper below on the right. Redundant per-card packaging descriptions are removed. Quantity, price, box conversion and invoice logic are unchanged.

## Owner workflow

Admin → Catalog → open an existing product → Product image → Upload / replace image. Save a new product before opening its image editor. JPEG, PNG and WebP inputs up to 8 MB are resized to at most 768 px and saved as WebP up to 512 KB. Remove image clears the reference; it does not delete historical blobs.

Sync the field app catalogue to receive a changed image reference. Viewed images are cached on the owner-bound device for offline use. Uncached, missing or inaccessible images show a neutral cube; they never block ordering. No illustrative or demo images are assigned to real products.

## Contract and safety

Migration 017 appends nullable products.image_path and the corresponding catalog view column. The private product-images bucket allows only the existing solo owner to read/insert owner/product/version.webp objects. No overwrite or delete policy is added. A separate set_solo_product_image RPC changes only the reference, validates uploaded object identity, locks the product row, checks its expected previous image, and uses the existing operation envelope for exact retry. Stale edits must reload. It cannot modify prices or financial snapshots.

Image editing requires connectivity. If a response is lost, keep the editor open and Retry image update with the same operation and upload identity. An existing upload is checked against its SHA-256 before retrying the reference update. Reload image state discards the in-memory attempt and reloads the database reference; unreferenced private objects may remain. Superseded blobs are deliberately retained; lifecycle cleanup is future work.

## Validation and release order

145 app tests pass; mobile and Admin builds pass. Database regressions 001–017 pass in PGlite, including owner/anonymous isolation, immutable objects, exact replay, stale reference rejection and unchanged invoice line history. This models storage metadata; a real owner Storage API upload remains the final acceptance check.

Synthetic browser preview at 390 px shows image/long-name/fallback and 0.5 Pack → $32 on a $64 Pack fixture. At 320 px there is no horizontal overflow. No real product was changed by this preview.

Apply 017 transactionally after 016, checking financial history fingerprints before/after. Deploy frontend only after schema and private bucket checks pass. Rollback frontend to the prior deployment if necessary; the nullable additive schema can remain. Do not drop media or rewrite issued documents as rollback.


## Automatic framing — 24 November2026

Selecting a new image now prepares a preview before any upload. The browser detects transparent or consistent plain border backgrounds, trims their connected outer margins conservatively, adds safety space and centers the complete retained image inside a768px square with5% frame margins. Output remains private optimized WebP. No photo is sent to an AI service. This is background-margin detection, not semantic object recognition or background removal. Busy, blank, tiny and edge-touching content falls back to the full photo. Owner can disable trimming, compare the preview and choose Save image or Cancel image. Existing images are not reprocessed. Upload/RPC retry and all financial contracts are unchanged.

149 tests and both builds pass; four pre-existing lint warnings remain. Crop regressions cover plain/transparent backgrounds, tall fit, blank and inconsistent backgrounds, edge-touching content and white interior label preservation. Synthetic browser before/after confirms enlargement and centering without clipped subject or console errors. Real product photo acceptance is still pending.


## Final approved background crop — 24 November2026

Supersedes the earlier square white-canvas/5% padding approach. Newly selected photos now use a square source crop containing the detected product and visible shadow, with safety space taken from the original photo background. There is no painted white canvas, generated background or stretching. The mobile photo placeholder is square at112px (86px on narrow screens), matching the output. Transparent images retain transparency. If background detection is uncertain or a square cannot contain the retained subject, the full image is preserved for owner review rather than clipping it. Automatic crop remains optional in the preview. This is conservative plain-background analysis, not semantic AI segmentation.

Existing saved images are not rewritten; re-upload their originals to use this final crop. Private media access, retry, sync and financial contracts are unchanged; no migration.

Validation:152 app tests, both builds, no new lint warnings. Added original-background/shadow containment and impossible-square fallback tests. Browser fixture confirms square output, original colored corner pixels, complete visible product/shadow, no white frame and no captured console errors. Real product upload → mobile Sync → offline acceptance remains open. This closes implementation of the approved framing refinement, not the wider beta release gates.
