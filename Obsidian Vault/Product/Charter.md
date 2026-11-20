# Charter and requirements
**Goal:** unify field sales and market visibility around one shop visit, then use the resulting data for management reporting and a weekly advisor brief. **Sponsor:** Hesham (product owner). **First user:** owner acting as pilot operator. Rep rollout follows the field gate. **Delivery priority (16 Nov 2026):** first plan PWA forms for client profile creation, outlet registration and basic visit capture into Supabase; next add the market survey. Orders and collections are separate follow-on work.

See the [three client-centered workflows](Form-workflows.md) for the exact form sequence. The table below describes the eventual visit. The first release covers Check in and Finish & sync; the second adds Survey.

| Step | Minimum requirement | Acceptance evidence |
|---|---|---|
| Check in | Select a known outlet or register one; store stable ID, assigned rep, location and time | Duplicate candidates are surfaced; GPS exceptions are documented |
| Survey | One row per tracked brand with presence, facings, shelf price, stock flag and optional weekly estimate; optional visit photo | Owner signs off on question list and a sample visit |
| Order | Choose active SKU, quantity, price and cash/credit; returns have separate signed line totals | Invoice aggregates and due dates reconcile against a synthetic fixture |
| Collect | Capture cash/transfer, amount, collector and invoice link when applicable | Full, partial and overdue examples reconcile; corrections preserve history |
| Finish & sync | Save offline; retry with stable IDs; surface errors and pending items | Reconnect/retry yields one copy; measured completion under three minutes |

Client capture requirements are finalized in [M1 client profile acceptance](Form-workflows.md#m1-client-profile-acceptance): one store per client record, separate owner account identity, required store/location fields, optional contacts, nearby duplicate warnings and explicit location correction. The existing creation lists remain the solo baseline. No parent-company grouping or additional roles are introduced.

Dashboard: sales, collections, outstanding/overdue and area coverage. Advisor: cite aggregate metrics, periods and caveats; no autonomous business actions. Standalone invoice workflow, inventory/warehouses, marketing, delivery and expanded V2 roles need separate scope decisions. Owner-only pilot does not remove the need to verify rep boundaries before rollout.
