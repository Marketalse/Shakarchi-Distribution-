# Manager workspace: reference research and implementation

Research date: 23 November2026. Issue #81. Baseline main762df01. Public pages only; no customer accounts, paid demos or private data were accessed. Marketing examples and vendor comparison rankings are not independently verified product tests. No vendor prices, ratings or adoption claims are used as design evidence. The SPOTIO supplied URL currently presents a2027comparison; its rankings and forward-looking statements are not accepted as verified current facts.

## Concepts and hierarchy

| Reference | Observed public structure | Adaptation to this application | Deferred / excluded |
| --- | --- | --- | --- |
| [Odoo](https://www.odoo.com/) and [CRM documentation](https://www.odoo.com/documentation/19.0/applications/sales/crm.html) | Connected business applications; CRM pipeline with leads/opportunities, meetings and next activities | Grouped business modules; one customer identity connected to invoices and field events | ERP replacement, manufacturing, procurement, opportunity forecasting |
| [YouSpot](https://youspot.com/) | Today, connections and automations; person-centered context and suggested follow-ups | Manager Home showing due work and source-linked customer context | Email/calendar/LinkedIn ingestion, automatic messages, relationship scores |
| [Brevo Sales](https://www.brevo.com/products/sales-platform/) and [pipeline](https://www.brevo.com/features/deal-pipelines/) | Contacts, companies and deals linked through configurable stages | Connect customer history and invoice records; searchable operational views | New deal pipeline and automation engine; withdrawn order-request state machine |
| [Salesforce Field Service](https://www.salesforce.com/service/field-service-management/) | Unified dispatcher/workforce workspace, appointments, territory context and offline mobile experiences | Separate confirmed field activity workspace with manager visibility and sync boundaries | Dispatch optimization, workforce permissions, service work orders and AI forecasting |
| [SPOTIO comparison](https://spotio.com/blog/field-sales-management-software/) | Territory, mobile capture and manager activity visibility emphasized | Field pulse and drill-downs from recorded visits to customers | Territory reassignment, route optimization and predictive scores |
| [Pipeline CRM comparison](https://pipelinecrm.com/blog/best-field-sales-crm/) | Account context, maps, mobile workflows and activity tracking compared | Customer record as operational anchor; shared navigation for field and sales records | Vendor rankings as factual authority; installing another CRM |
| [Glide field sales](https://www.glideapps.com/use-cases/field-sales) | Task-focused mobile updates and connected manager visibility | Reuse current field capture and authoritative Supabase loader | Platform migration, custom integrations and new role permissions |

These are interpretations of the public structures, not claims to have inspected the vendors' internal schemas. No proprietary assets or source code are copied.

## Our workspace hierarchy

- Workspace: Manager Home → Field Activity → Customers.
- Sales & finance: Orders & Invoices → Collections.
- Build: Product Catalog → Surveys & Responses → Imports → Service Areas.
- Intelligence: Reports → AI Advisor.
- Administration: Settings.

Customer is the existing outlet identity. Existing contact fields remain on that record. Invoice lines reference products and preserve issued snapshots; receipts retain existing invoice links and immutable FX evidence. Visits and survey submissions relate to customer records. Product hierarchy remains Brand → Product Line → Variant. Published survey versions and responses retain their existing lifecycle. This is navigation and read-only context, not a schema redesign.

## Implemented

1. Manager Home: deterministic follow-up queue, current unfinished visits, existing sales/outstanding/operational KPIs, module launch links and recent confirmed events.
2. Field Activity: searchable, type-filtered, period-aware event feed; start and completion are separate events, not inflated unique-visit KPIs. Show50more limits initial rendered rows.
3. Customer context: confirmed invoices, totals, current outstanding and expandable recorded activity, above the existing edit/location controls.
4. Reports: existing reconciled financial/operational report moved to a dedicated route; no report math changed.
5. Grouped sidebar: current management modules remain reachable, with scroll support and compact navigation.

## Source and financial boundaries

Same loadAdminData Supabase reads, owner gate and automatic refresh. No extra external request or data integration. Focus queue is overdue-or-reminder-due, one row per invoice; not AI scoring. Period controls affect event/sales cohorts; current debts and unfinished visits are explicitly all-date. USD, half-pack math, invoices, payments, survey posting and Mobile remain unchanged. No migration, API/RLS expansion or new runtime dependency.

Unsent phone drafts are not visible to Admin before upload. Last-loaded timestamp remains visible. Invalid/unavailable activity sources produce an error, not fabricated zero counts. Existing per-invoice receivables and unallocated cash semantics are retained. No account-credit redesign or new request/approval pipeline.

## Verification

-123tests passed, including6new deterministic follow-up/activity checks.
- Mobile and Admin builds pass; four existing lint warnings remain. Mobile output asset names unchanged from the baseline.
- Synthetic local browser: Home figures and queue; activity navigation, type filter, search match/no-match; linked customer context and expandable invoice history; desktop1440and compact390viewport layouts with no horizontal overflow; captured console errors empty.
- Browser fixture is isolated, temporary and removed from release source. It is not a production account or live-database acceptance.
- Full #58 audit, #13 wider reconciliation and owner signed-in acceptance remain open. No live business records changed.
