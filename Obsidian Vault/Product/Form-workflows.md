# PWA form workflows
These are three user flows, all centered on the client record. Client/profile capture is the accepted M1 baseline below. Other workflows have their own implementation and acceptance issues.

| Workflow | Sequence | Acceptance |
|---|---|---|
| 1. Client creation | Create → Client profile → enter client details → Save | Stable client ID; required details validated; local list shows it after save; server-backed client pickers show it after sync; no duplicate on retry |
| 2. Order submission | Choose client → open order form → choose brand → choose SKU(s) → enter quantity per SKU → calculate total → review and submit | SKU list filters by brand; quantities are positive; each line is quantity × unit price; order total is the sum of line totals; client link and submitted prices persist |
| 3. Survey submission | Choose client → choose survey type → fill its questions → submit | Survey type determines the form; response stores client, chosen type/version and answers; validation and offline retry preserve one submission |

## M1 client profile acceptance

Accepted 20 November 2026 for [issue #7](https://github.com/Marketalse/Shakarchi-Distribution-/issues/7). The owner accepted the current general form cleanup and explicitly requested finalizing and closing this requirements issue. This records the existing solo model; it does not add fields or change the database.

### Identity and relationship
- `profiles` is the authenticated app owner. `outlets` is the client/store business record. They have separate UUIDs; a contact is not another app user.
- V1 uses one client record per physical store. Several stores may share an owner/contact, but remain separate records. A parent company/multiple-store grouping is not implemented or required for this solo baseline.
- The same `outlets.id` is reused by linked workflows. Editing a name, phone or address must retain that ID. Do not delete/recreate a client to correct its details.

### Fields

| Field | Requirement | Rule |
|---|---|---|
| Store name (`retail_name`) | Required | Trimmed, nonblank |
| Province, area | Required | Nonblank; creation offers the existing province list |
| Store type (`outlet_type`) | Required | Select from the existing creation list; retain existing values on edit |
| Relationship | Required, default Prospect | Prospect or Customer |
| Store location (`lat`, `lng`) | Required on creation | Fresh device capture plus explicit store confirmation; valid coordinate ranges |
| Owner name, owner phone | Optional | Missing owner phone does not block saving |
| Staff name, staff phone | Optional | Reveal with Optional contact; retain existing details when collapsed |
| Shop phone, written address | Optional | No assumed phone uniqueness or required phone format |
| Owner account full name | Required in account editor | Nonblank; belongs to `profiles`, not a client |
| Owner account phone | Optional | Separate from client contacts |

System-managed values: client UUID, creator/assignee, creation/update timestamps and GPS accuracy/capture time/source. The solo owner is the assigned user; no user selector or additional role is introduced. Existing credit-limit/payment-term defaults stay unchanged and are not extra M1 capture requirements. Historical GPS evidence may remain unknown rather than fabricated.

### Capture and correction
- Capture store coordinates once during creation. Show a simple location button, not coordinate numbers.
- An approximate fix prompts a warning and can be recaptured; no new hard 50m accuracy rejection is introduced.
- Visits reuse the saved destination. No visit/survey GPS sampling is required. Only explicit Correct store location replaces it, with confirmation, a reason, current-version check and retained operation evidence.
- Ordinary client edits exclude coordinate/identity/assignment fields and reject a stale version. Reload/sync before retrying changed details.
- Creation stores the client and upload entry together locally. Server retry uses the same UUID. Updates retain the same operation UUID/payload after an uncertain reply.

### Duplicate policy and examples
- Before creation, show locally available stores within 50m as possible matches. The owner can open an existing store or explicitly confirm creating a different nearby store.
- This is a candidate warning, not a global uniqueness guarantee. Separate stores can share a building, name or phone; never merge them automatically. Offline devices/incomplete reference downloads can miss candidates; cross-device deduplication and merging are separate future work.
- Valid example: Synthetic Store, Baghdad, Test area, Kiosk, Prospect, confirmed captured location; no contact phone is required.
- Invalid examples: blank name/province/area/type, invalid coordinates, or saving before capture confirmation; do not queue an incomplete creation.
- Update example: change Synthetic Store to Updated Synthetic Store and add an optional contact; preserve client ID and saved location. Repeat an uncertain request once using its retained operation, not a new identity.
- Nearby example: two distinct stores 20m apart require an explicit choice; reopening the existing record reuses its ID. A 300m-away store is not a 50m candidate. Upload retries of one record do not create a second UUID.

### Acceptance evidence and boundaries
- [PR #31](https://github.com/Marketalse/Shakarchi-Distribution-/pull/31): identity-preserving client edits, stale/field guards and retry-safe capture; [#25](https://github.com/Marketalse/Shakarchi-Distribution-/issues/25) complete.
- [PR #30](https://github.com/Marketalse/Shakarchi-Distribution-/pull/30): capture-once storage and explicit correction.
- [PR #35](https://github.com/Marketalse/Shakarchi-Distribution-/pull/35): hidden coordinate text and optional contact UI; [#34](https://github.com/Marketalse/Shakarchi-Distribution-/issues/34) complete. Synthetic browser checks preserved contact values across hide/save; production form verified without creating live records.
- Current closure checks: focused creation, duplicate-distance, local preservation, sync retry, capture and navigation tests; disposable database regressions through 012 verify owner isolation, edit replay, stale edit rejection, unsupported-field denial and location preservation. Results are recorded on #7.
- [#29](https://github.com/Marketalse/Shakarchi-Distribution-/issues/29) retains real-phone GPS/native navigation acceptance. M1 closes requirements and documented behavior, not that field test, multi-device uniqueness, or a full pilot release.
