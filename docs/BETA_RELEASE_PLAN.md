# Beta 0.1.0-beta.1 — release preparation

Status: PREPARED FOR ACCESS-DESIGN REVIEW, NOT DISTRIBUTABLE.
Issue: https://github.com/Marketalse/Shakarchi-Distribution-/issues/89
Source baseline: 5abbf89367979ef7b74e14d5025a52669efca5a9 (PR88).
Owner accepted the current product/image refinements on24November2026. This records that acceptance; older unrelated open issues are not silently closed.

## Premise Critique

The deployed applications are single-owner applications. The presence of a rep enum and assigned_rep column in migration001 does not enable rep access: migration003 adds restrictive sole-owner policies, financial/capture RPCs enforce owner authorization, private product media is owner-scoped, and the device cache binds one verified identity. Extra Auth accounts alone cannot use the app. Granting every tester owner access or broadly weakening is_solo_owner would expose business records and ledger operations.

## Trade-off Analysis

1. Give testers production owner credentials: rejected. Shared privileges and identity prevent attribution and expose production data.
2. Add independent accounts directly to production: deferred until a separately reviewed production multi-user rollout; it changes the accepted solo security model and financial authorization.
3. Separate beta environment with synthetic data and least-privilege rep accounts: recommended. Extra environment setup, but independent accounts can be tested without exposing or mutating the production ledger.
4. Separate single-owner project per tester: possible but duplicates environments and does not verify the intended manager/rep workflow.

## Counter-Proposal

Provision a dedicated beta Supabase project and separate beta Mobile/Admin origins. Keep production backend, storage and credentials unchanged. Seed fictional customers/products/visits/invoices and non-sensitive demo images only; never copy production customer or financial rows. Use invitation-only tester accounts and one beta owner-manager. No public signup, shared owner login, autonomous advisor actions or external AI calls in the initial beta. No production secrets are copied to beta.

The existing Admin site is an Admin portal (catalog/customer/order/collection/survey/report management), but currently has no complete multi-user invitation/role/assignment/revocation interface. Add that interface only for reviewed beta roles, enforced by backend authorization; hiding buttons is not authorization.

### Access matrix

| Capability | Beta owner-manager | Beta rep tester | Anonymous/disabled |
|---|---|---|---|
| Invite/deactivate testers and assign sample customers | Yes | No | No |
| View all beta customers and operational activity | Yes | Assigned customers/own activity only | No |
| Create/edit customer, start/end visit | Yes | Own assigned sample customers; actor assigned by server | No |
| View active sale catalog and product photos | Yes | Sale catalog only; no cost/import fields | No |
| Change product/price/cost/image/FX | Yes | No | No |
| Draft/submit sample orders and collections | Yes | Assigned customers; server-validated actor and frozen request | No |
| View invoice/customer balance | All beta records | Assigned customers only | No |
| Refund/correct ledger or import data | Owner only | No | No |
| Global reports/profit/advisor/Admin portal | Owner only | No; field app only | No |
| Offline cache/queue | Bound to environment and authenticated identity | Same restriction; no other tester's cache/queue | No fresh access |

No tester email, invitation or grant has been created. Invitation emails and project/quota availability are provisioning inputs after design approval.

### Required implementation

- Server authorization: explicit active membership/role and outlet assignment predicates, not broad owner impersonation. Every definer RPC validates caller, resource and action, including replay-result visibility. Bound operation UUIDs to actor/environment; guessed UUIDs cannot reveal another actor's response.
- Data filtering: assigned customer scope across visits, survey sessions, orders, lines, receipts and balance views. Reps cannot query hidden cost/profit fields through direct APIs; use restricted views/column privileges where base-table RLS is insufficient.
- Storage: beta-owner image writes; active rep access only to allowed catalog images; survey photo access follows assigned resources. Guessing paths or signing URLs cannot bypass permissions.
- Device isolation: beta origin and backend identity plus account binding; pending work from A cannot upload under B. Account switch preserves or safely locks A's unsent queue. No clear-data shortcut. Revocation is enforced online; already downloaded information cannot be remotely erased while offline. Define bounded offline access duration before distribution.
- Admin portal: invitation/active status/assignment controls with owner-only backend enforcement. Credential entry and invitation recipients remain private.
- Release identification: visible beta version and environment, feedback instructions, distinct app name/icons/origins; build preflight rejects production backend binding. Never reuse the production database for destructive tests.
- Beta SQL changes stay out of automatic production migration execution; guarded isolated deployment only. No changes to production access policy or financial history under this task.

### Dependency and re-verification matrix

| Existing issue/surface | Required beta delta | Evidence before distribution |
|---|---|---|
| #8/#21 database/access baseline | Re-scope solo acceptance for beta role model; preserve original evidence | A/B/owner/anonymous and disabled-user tests for tables, views, RPCs and storage |
| #9/#24/#41 mobile/session/recovery | Account/environment-scoped queues; identity changes and revoked sessions | Two sessions, wrong actor replay, offline reload/reconnect and no duplicates |
| #12 financial operations | Assigned customer posting, frozen snapshots and actor-scoped replay | Sample totals/partial payment/FX/retry; historical snapshots unchanged |
| #13 reporting | Owner beta totals from rep-originated sample records | Independent source reconciliation; keep owner's explicit open status |
| #38 catalog/UOM | Active catalog read without cost exposure; pricing unchanged | Half-pack steps, box rollover, server rejection of invalid catalog |
| #58 screen audit | Rep-denied routes and all pending/error/offline states | Screen inventory and phone scenarios tied to exact beta version |
| #81 Admin / #82 Mobile | User administration vs rep field UI | Assigned-customer workflow from independent accounts |
| #10/#79 surveys | Use only approved published sample templates; held/new templates remain separate | Capture test only where a sample template exists; exclusions labelled |
| #14 advisor / #69 accounting | Owner-only; broader accounting excluded | No tester grants or unsupported financial-statement claims |

### Verification gates

1. Fresh accepted source build/test baseline; freeze commit and artifact hashes.
2. Dedicated beta environment identity proven; no production URL/keys/data in distributed beta configuration.
3. Owner plus testerA/testerB/anonymous/disabled identities. Assert each allowed action and deny forged customer/product/order/media/operation IDs. Check direct API access, not just UI.
4. Real independent sessions and concurrent reconnect/lost-response retries on disposable rows; exactly one accepted operation and unchanged prior invoice snapshots.
5. Account switch/revocation and storage/queue isolation, including a previously cached device. Confirm actual offline authorization boundary with owner before rollout.
6. iPhone/Safari/Home Screen and Android/Chrome pilot; initial online Sync, airplane-mode draft/reload, reconnect and owner portal confirmation. Do not promise upload while the OS suspends the app: retry on reconnect/resume/open is required.
7. Owner signs off restricted beta distribution. Capture tester outcomes privately and triage P0/P1 before expanding invitations.

## Blocking Gate

Approve the proposed isolated beta environment and owner/rep access matrix before implementing access changes or granting tester accounts. The repository AGENTS.md states: "If the requested change carries high risk (data loss, breaking schema changes, insecure auth/secrets handling) ... do not apply edits yet. Ask for explicit confirmation to proceed with your counter-proposal". This applies because enabling separate identities expands the approved solo access model. The review pack is prepared before requesting this decision; no security policy, auth code, production database or invitations were changed.

### Stop and rollback

Any cross-account record/image access, duplicate financial posting, lost pending work or production-backend binding stops the beta. Disable new beta invites and affected beta sessions, retain queues/evidence, and revert the beta frontend to its prior identified deployment. Do not clear devices or delete ledger rows as recovery. Production remains unchanged and is not the beta fallback.

### Exclusions and status

This pack is preparation, not a public beta release or completion of multi-user support. Existing152 tests and disposable001–017 checks cover the solo baseline only. Full accounting, inventory valuation, unapproved survey templates and unsupervised AI decisions are excluded. Beta URLs and credentials are intentionally absent until resources and access controls are verified.
