# Visit retry fix and client invoice feedback — #59 / #60

21 November2026. Owner reported the phone results were good and requested client overdue details plus clean, branded invoices. Owner clarified that invoice Unit Cost means the selling price charged to the client, not internal purchase cost. No cost-price disclosure is added.

## Verdict and implementation
APPROVE/ADAPT: reuse exact USD balances and stored invoice snapshots. Overdue is positive outstanding where due_date is before the current Baghdad day. Due today and missing due dates are not silently called overdue. Unknown aging is disclosed and invoice duplicates cause a visible failure rather than double counting.

Client payments/overdue details are available within the mobile client Summary/Profile and admin client editor, with links to the correct invoice. This is client-level operational collection context; separate-admin management/reporting remains unchanged.

Invoice recipient uses its original recipient snapshot, with a current client-name fallback only when the historical name is unavailable. Items use stored variant/name, separate brand and mode/category, original unit selling price, quantity and line total. SKU/hash identifiers are not used as display-name fallbacks. Mode MTL/DTL is read from existing line metadata; generic FMCG categories stay supported. Historical amounts, quantities and snapshots are not rewritten. On small screens the semantic item table adapts to labeled rows.

The company identity header and optional VITE_COMPANY_LOGO_URL slot are implemented. No actual company logo asset was found/supplied; the app checkmark icon is not misrepresented as the company logo. Until supplied/configured, the company name wordmark is shown. This part of #60 remains incomplete.

## #59 migration014
The new open_solo_visit_v2 stores candidate-request → resolved-visit in the existing private operations registry, before a later open stop can influence a replay. Old open_solo_visit remains an owner-checked compatibility wrapper. A prior closed result returns the same original identity; it is never silently rebound. Replaying an unmapped old candidate that itself identifies an ended visit is rejected, even when a newer visit is open.

Updated clients require v2, so previews cannot silently use the unpatched server RPC. New offline capture sessions carry start_protocol2. Older unresolved sessions without an acknowledged visit identity are retained and paused for review; no automatic legacy conversion is claimed. Already-resolved sessions retain their original visit. Definitive closed-visit submission failures preserve answers and frozen requests for review. No automatic cloning of uncertain submissions is introduced.

No existing business rows, RLS policies or finance calculations are changed. Operations records are retained. Apply014 only after review, before deploying the updated frontend; reload the phone online before resuming capture. Closed/legacy unresolved sessions require explicit review rather than guessing a target. Multi-session races and multi-tab checks remain #41; single-connection tests do not prove them.

## Verification
64 app tests pass. Both TypeScript/Vite builds pass. Disposable migrations001–014 and targeted lost-reuse-response → original finish → newer stop → exact replay regression pass, with no extra visit, changed-payload denial and owner/anonymous denial. Client tests cover clean snapshot names, missing metadata, exact overdue sums, duplicate rows and Baghdad midnight. Offline tests retain older unresolved sessions and closed-visit rejected requests/zero/false answers. Four existing lint warnings and the mobile bundle-size advisory remain. No new visual/browser sweep is claimed; #58 remains awaiting approval.

## Release status
Migration014 is prepared but NOT applied to production. The frontend is not released. Repository AGENTS.md requires review for sync/data-model changes. #59 stays open until that review, migration verification and release. #60 awaits the actual company logo. M3B #10 remains on owner hold.

The owner-positive phone report is recorded for the initial pilot check; exact completion times, all-provider handoff coverage and survey acceptance were not supplied. M4 is not silently closed.
