# M3 capture and survey readiness — 21 November 2026

Decision: ADAPT. Preserve the solo, capture-first workflow. Implement reusable offline survey infrastructure; wait for the owner's survey templates before creating or publishing questions. No new services, dependencies, SQL migrations or live records.

## Implemented for review
- Additive IndexedDB v3 upgrade retains existing queues and records.
- Server-verified owner binding gates cached workspace access and sync; a different account cannot open the bound workspace.
- Published survey versions and approved competitor choices cached per owner.
- Raw survey drafts survive refresh, including zero/false answers. Queued submissions freeze their resolved visit and request before sending.
- Lost replies retain the same operation identity; rejected submissions remain available for correction as a new linked operation.
- Visit finish waits for queued surveys. A pending finish is resumed after refresh rather than creating another visit.
- New-client profile edits queue behind the original creation without altering its uncertain payload.
- Reference downloads paginate rather than silently stopping at the default row limit.

## Evidence and limits
48 app tests pass, including eight offline capture cases: draft reload, pending finish reload, lost reply replay, rejected correction, owner mismatch, legacy ownership conflict, local v2 upgrade and submit-before-finish ordering. TypeScript/Vite build passes. Lint has existing effect warnings and a draft-handler Date warning; production bundle exceeds 500 kB.

This is source-level/disposable IndexedDB verification, not phone or deployed acceptance. Browser form integration, expired sessions, disconnected phone reconnect and cross-device/multi-tab races still require review. Existing backend timestamps record synchronization time, not a backdated offline visit time. A lost visit-open reply combined with another device closing the server visit is not covered by this client-only change. Keep #9 open.

Legacy financial queue rows are retained for explicit reconciliation under #12; no guessed conversion. No catalog/UOM/cart or ledger changes. #38 remains separate.

#10 remains open for the owner's templates, photo requirements, approved survey end-to-end verification and report reconciliation. Do not publish synthetic forms to production.

Exact matching to the updated 27-screen Figma design remains pending: the design-context tool returned its plan limit, so no high-fidelity screen response was available. Functional M3 changes do not count as completing the visual redesign.

Access and sync changes require PR review before release under AGENTS.md. No production readiness or milestone closure is claimed.

## Recovery verification — 21 November 2026
Shared visit database regression passed: order/survey starts reuse one open stop, explicit finish and replay do not duplicate it, next stop and second-user denial behave correctly. 48 app tests passed.

A real browser fixture exposed a submission bug: setting busy disabled the fieldset before FormData was constructed after an await. The correction snapshots values at submit time before disabling controls. Browser verification then retained No/zero/choice answers through reload, queued a survey while the mock server was unavailable, retained it through another reload, synced after recovery and finished only afterward. Visible call sequence: open_solo_visit, submit_solo_survey, finish_solo_visit. This is simulated server failure in a desktop browser, not a phone flight-mode test. No production form or business record created.

Phone acceptance remains open under #41/#9. Owner uses iPhone/Safari. Open production online and Sync first; use an existing approved form/client only. Turn on flight mode and turn Wi-Fi off, enter survey answers, wait for Draft saved, reload and reopen the same client/form; verify answers remain. Save survey, restore network, Sync, verify one submission, then Finish survey visit. Do not clear Safari website data with pending records. If no approved form is available, stop; owner templates remain pending rather than inventing a production survey. Record actual result before closing phone acceptance.
