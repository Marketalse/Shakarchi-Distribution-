# Solo database regression rehearsal

From this folder, run `npm install` and `npm test`. This installs the pinned PGlite development dependency and creates a disposable database in memory. It never connects to Supabase.

To reuse an existing PGlite installation, set PGLITE_MODULE_URL to its absolute dist/index.js path before running node solo-integration.mjs.

The harness provides synthetic auth/storage objects and runs migrations 001–005. It exercises finance rollback and retries, immutable ledger behavior, reminders, survey validation, import rollback, brand activation and access boundaries. PGlite uses one database connection, so this is not a real multi-session concurrency test. Rehearse concurrent postings in staging before rollout.

## Account build verification — 19 November 2026

Migrations 001–005 were applied to the new WSD_APP project and recorded in its migration history. The target reference is stored in the existing CLI link configuration. The current config disables absent seed files and uses the app's local port 5173. The sole owner is provisioned.

The disposable regression suite passed again. A separate live rollback transaction confirmed shared visits, invoice replay, receipts/refunds, reminder settlement/reopening and another user's denial. No synthetic business rows were retained. Direct PostgreSQL access timed out; deployment used the authenticated management SQL API over HTTPS. Real concurrent sessions and application transport-loss recovery still require verification.

## Catalog boundaries and reversibility

The regression harness now applies 006 and verifies owned/competitor consistency, order catalog filtering, competitor invoice rejection with transaction rollback, competitor-only fixed/flexible survey targets, and admin-only definition writes. It also tests the behavioral rollback at ../rollbacks/006_catalog_boundaries.sql. Before that rollback, competitor products must be inactive. The rollback preserves UUIDs, rows, invoice history and additional nullable target columns. Execute it only through a new reviewed forward migration, preserving migration history.

Existing product and brand IDs and classification flags are retained by 006. Our catalog products require a selling price. Competitor definitions can leave selling price empty; observed competitor prices belong to survey records. Existing product/brand classification mismatches cause the migration to abort for review.


## USD baseline — issue #21

The harness additionally applies 007 and rehearses 008 on an empty USD database. It verifies cutover refusal when monetary records exist, exact USD amounts, manual-rate expiry/current-version checks, immutable settlement snapshots, local receipts/refunds/corrections, operation replay, owner isolation and catalog price-intent checks. It remains single-session synthetic coverage, not hosted UI or PostgreSQL concurrency proof.
