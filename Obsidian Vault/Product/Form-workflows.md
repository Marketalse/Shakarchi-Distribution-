# PWA form workflows
These are three user flows, all centered on the client record. Delivery starts with profile/data capture, then market surveys; the order workflow is specified now for parallel planning.

| Workflow | Sequence | Acceptance |
|---|---|---|
| 1. Client creation | Create → Client profile → enter client details → Save | Stable client ID; required details validated; record appears in both client pickers after save; no duplicate on retry |
| 2. Order submission | Choose client → open order form → choose brand → choose SKU(s) → enter quantity per SKU → calculate total → review and submit | SKU list filters by brand; quantities are positive; each line is quantity × unit price; order total is the sum of line totals; client link and submitted prices persist |
| 3. Survey submission | Choose client → choose survey type → fill its questions → submit | Survey type determines the form; response stores client, chosen type/version and answers; validation and offline retry preserve one submission |

## Data contract to review
- Client profile is a business record, separate from authenticated `profiles`. Propose name, customer/prospect status, contact details, location/outlet link and creator; the owner approves required fields and whether a client can have multiple outlets.
- Current SQL uses an outlet as the commercial record and ties order/survey data to a visit. Decide whether to reuse that record or introduce a separate client entity, and whether standalone orders/surveys need a visit created behind the scenes or a revised relationship.
- The current survey records brand answers, with no survey type or version. Confirm one market survey type for the first release and design typed templates before adding more. Verify client and survey type references in Supabase.
- Brand-to-SKU mapping, price source, rounding and units need explicit rules. Display a live estimate in the PWA and validate authoritative totals against the stored order lines. Record the unit price at submission.
- Use the same client picker and stable IDs across flows. Show saved locally, synced and failed states clearly. Use synthetic records for setup and review.
