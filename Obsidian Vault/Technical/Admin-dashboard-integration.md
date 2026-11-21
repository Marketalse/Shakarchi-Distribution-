# Admin dashboard design integration

21 November 2026. Issue #51. Owner clarified that this is a general FMCG distribution platform. Use neutral catalog terminology and preserve imported legacy records. Design files are references; none of the supplied Figma scripts was executed.

## Delivered frontend
The supplied Raff desktop design is implemented as a responsive owner workspace at /admin. Navy/lime sidebar, compact mode/mobile menu, global search, date-filtered sales chart, truthful status badges, current balances and real recent invoices replace sample values. Admin code is loaded separately so field views do not load the whole admin interface. Existing client cards now contain direct saved-coordinate Maps/Waze links rather than detached actions.

## Database bindings
| Area | Existing source and actions |
| --- | --- |
| Overview | outlets, solo_invoice_balances, payments, collection_reminders; owner-bound local pending response/import counts |
| Clients | outlets and existing creation outbox; update_solo_client; explicit correct_solo_client_location |
| Invoices | solo_invoice_balances and immutable order_lines snapshots; existing invoice detail/share |
| Collections | signed payment ledger, post_solo_collection, reschedule_solo_reminder, original FX/refund/correction evidence |
| Catalog | structured existing product/brand fields and existing admin update/import operations; separate editor route |
| Surveys | survey_versions, survey_runs, market_observations; existing supported text/number/boolean/choice version builder |
| Imports | existing JSON object preview and atomic import_solo_data; acknowledgment clears committed preview |
| Settings | owner full name/phone, immutable manual FX versions, current service-area controls |

All finance stays USD. Sales/net-cash cards use explicit date windows in Baghdad time; outstanding balances and collection progress are labeled current/all-time. Exact cents remain for balances, ledger and detail. Missing timestamps are shown as unavailable rather than crashing a view. Failed refresh retains last successful data with a visible error/retry state. No sample balances or fabricated draft/import counts are inserted into production.

## Latest repository reconciliation
PR #50 was merged to main as f37acb6 while this branch was in progress. Fetched and merged it, resolved App/client form/admin navigation overlaps, retained cached active-area choices and the owner-checked settings RPC, and exposed /admin/areas from the redesigned Settings page. Read-only live checks confirm13 objects exist, RLS enabled, anonymous read/activation denied, no authenticated direct writes, three configured areas and an owner-only policy. Both production deployments of that prior amendment succeeded. This integration applies no production migration and performs no live record mutation.

## Verification
-55 app tests pass, including admin period boundaries, exact monetary ratios, pagination/error propagation, missing timestamps and existing area/cache cases.
-TypeScript/Vite build passes. Lint has only retained effect/purity warnings in existing modules; main bundle size warning remains. Field entry bundle is approximately658kB; admin logic is a separate approximately56kB chunk.
-Disposable database regression through001–013 passes (owner/anonymous isolation, immutable finance, classification, visits, correction/retry and service areas).
-Live read-only metadata check found no missing fields among the eight admin data sources.
-Synthetic browser checked overview/search; owner, unapproved-account and signed-out gates; invoice detail; payment posting; reminder reschedule; profile save; survey builder; JSON preview/commit; client creation/GPS/edit/admin return; refresh failure/retry; mobile menu and390px layout; navigation within retail cards. No production business data was submitted.
-Browser interaction checks preceded the final main merge; after merge55 tests, full build, database regressions and live area/security metadata were checked. Native phone poor-signal/handoff acceptance remains #41/#47; multi-session concurrency is not claimed.

## Boundaries / follow-up
Existing JSON imports and four question types are connected; CSV upload/photo/multiselect are not advertised as implemented. Survey templates remain owner-supplied; no real survey was published. Order UOM/pricing changes remain #38. Generic catalog normalization and report hierarchy need a separate reviewed proposal #52; no taxonomy migration is applied by this release.
