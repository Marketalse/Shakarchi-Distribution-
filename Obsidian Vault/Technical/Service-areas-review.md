# Service-area settings #48 — prepared, not activated

21 November2026. Separate from released UI PR #49. Additive migration013 is proposed, not applied to production. Existing linked tasks #10/#13/#38/#41 are excluded from execution.

## Implementation
- Sole-owner service_areas read policy; authenticated users cannot write the table directly.
- Existing idempotent operation journal backs activation changes with expected-version checks. Other users/anonymous callers denied.
- Initial approved labels: Mosul→Nineveh, Kirkuk→Kirkuk, Salah Aldin→Saladin. These mappings do not change existing client geography. An existing province displays its raw saved label; no automatic assertion that a Nineveh client is in Mosul.
- Admin hub links a three-area activation page. New client choices exclude inactive areas. Existing client values outside the list remain available as saved values.
- Per-owner versioned reference cache survives offline/reload and failed refresh; invalid cache data is rejected. Pending activation operations retain exact retry identity. Settings refresh is optional for older backend rollout; core sync is not blocked by an absent settings table.
- No new dependency or service. No catalog, quantity, pricing, survey question, financial record or previous RLS changes.

## Evidence
51 app tests and build pass. Disposable database regressions through013 pass: owner-only access, exact replay, changed-payload/stale-version/unsupported-field rejection, direct-write denial, other/anonymous access and existing client preservation. Synthetic browser toggled Mosul inactive, confirmed exclusion from new-client choices and retention of Baghdad(saved) on a pre-existing profile. Native phone and concurrent multi-session checks are not claimed. Lint reports effect/purity warnings; bundle warning retained.

## Review gate
AGENTS.md requires requesting review for data-model/access/sync changes; the earlier instruction also prohibits unreviewed production migration application. Review this additive settings table and its fixed label/province mapping before activation. No production migration was applied. Existing UI PR49 release does not depend on this draft. No unrelated dependent issues were executed.
