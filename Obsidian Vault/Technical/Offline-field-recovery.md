# Offline field workflow — #41 regression repair

21November2026. Owner reported offline mode not working during M4. Verdict: FIX; earlier online order approval is not offline acceptance. Reopened #24/#38 for the changed shared visit/order path. #11 remains in progress.

## Contract
First load/sign-in/reference download occurs online. Afterward the verified bound device can open saved field data offline, save new clients, edit order drafts, queue orders, survey submissions and permitted observation photos. Offline orders are pending requests, never confirmed invoices or invented invoice numbers. Existing survey templates only; #10 remains held.

Local-first visits do not request new GPS. Each saved visit start has one request identity/source and one resolved server identity. Upload sequence: clients → resolve stop → its survey/order commands → finish after acknowledgment. A lost acknowledgment replays the same operation. Original local request and first resolved transport request are both retained; no automatic rebinding/repricing/conversion. Rejected/legacy rows remain reviewable and do not prevent independent valid work from uploading.

Photos and observation commands commit atomically on-device. Upload uses the immutable operation path before posting;409conflicts verify content digest. Local photo bytes are removed only after accepted acknowledgment. New IndexedDB version4adds the attachment store without deleting existing records.

Automatic sync triggers: reconnect, new queued work, foreground/visibility/focus and30-second retry while visible. Owner is verified online before uploads; definitive denial locks cached UI. Explicit local sign-out disables offline access and retains drafts. Local cached identity is not multi-user permission or a background server credential. Account mismatch remains denied.

Catalog/invoice snapshots are downloaded to IndexedDB under the bound owner. No authenticated API responses are placed in the service worker's HTTP cache. The service worker precaches the field shell and supports nested field navigation. Cached histories may be stale and show saved-data context; missing snapshots report unavailable, never zero. Me displays offline download readiness.

## Validation and limits
80app tests and both builds pass; disposable001–016 DB regressions pass; existing lint warnings remain. Fixtures verify persisted/reopened queued operations, one accepted invoice after lost reply, canonical visit mapping, queue ordering,0/false values, photos, independent uploads, owner denial and nondestructive device upgrade. No live financial test writes or Supabase schema changes.

Actual iPhone flight-mode/reload/reconnect acceptance is still required. Existing local browser launch failure and remote interaction country restriction remain; no complete screenshot audit is claimed. Safari may suspend a closed app; upload resumes while running or reopened. Device storage is not a server backup; do not clear website data with unsynced work.

## Owner retest after release
Open online, let Sync download data, check Me → Offline data ready. Turn off mobile data and Wi-Fi, reopen the field app, view a client/catalog, edit an order and reload. Submit an intended test/real field record once; it must show saved/pending rather than issued. Reconnect with the app open and confirm automatic upload and exactly one accepted result. Use only an existing approved test survey/client for survey/photo trials; do not invent production fixtures or publish templates to satisfy the test.
