# Database dictionary
Source: [initial migration](../../supabase/migrations/001_initial_schema.sql). This describes the checked-in draft, not a live database. Business client profile, survey types, and their relationships are open design decisions described in the [form workflows](../Product/Form-workflows.md); these entities are not present in the initial migration. FK = foreign key.

| Table | Identity and relationships | Main attributes and rules |
|---|---|---|
| profiles | id → auth.users | full_name, owner/rep, active, created_at |
| outlets | client UUID; unique server code; assigned_rep and created_by → profiles | retail name, contacts, lat/lng, address, province/area/type, customer/prospect, credit limit, payment terms days, timestamps |
| products | UUID; unique product_line + flavour | puffs, carton units, cost/wholesale/retail prices, currency (IQD default), own-brand, active; standalone SKU field absent |
| survey_brands | UUID; unique name | own-brand and active flags |
| visits | client UUID; outlet and rep FKs | check-in/out, lat/lng, outcome, note, photo_path, synced_at |
| survey_answers | client UUID; unique visit + brand | presence, facings, shelf price, out-of-stock flag, estimated weekly sales |
| orders | client UUID; unique invoice number and visit FK; outlet/rep FKs | cash/credit, due date, created_at; one order per visit |
| order_lines | client UUID; order and product FKs | sale/return, positive quantity, nonnegative unit price; signed calculated line total |
| payments | client UUID; outlet, optional visit/order and collector FKs | nonzero amount, cash/transfer, note required for negative amount, collection and sync timestamps |

Outlet 1→many visits/orders/payments; visit 1→many answers, 0→1 order and 0→many payments; order 1→many lines and 0→many payments. `outlet_balances` aggregates signed sales and net amounts collected; `overdue_invoices` reports past-due orders with positive outstanding after linked payments. Paid/partial/unpaid are derived business states to reconcile, not a status column in this draft.

RLS is enabled on all nine tables. Triggers block update/delete for orders, lines and payments. Review authenticated product cost exposure, record consistency across payment/order/visit, inactive users, assignment changes, read access to reports and the nearby-outlets function’s cross-assignment disclosure. Resolve SKU identity and payment allocation/reversal policy before importing records or using the outputs for finance.
