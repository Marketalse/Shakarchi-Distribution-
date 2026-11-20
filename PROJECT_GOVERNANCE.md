# WSD Basic Retail — Project Governance

## Binding scope
Build a low-cost, single-admin FMCG wholesale/distribution MVP with AI-assisted coding, the existing project stack, a responsive browser application, and Supabase as the authoritative database. Prioritize outlet management, sales, invoices, collections, and performance monitoring. AI explains verified data. Telegram is optional; no separate mobile application or multi-user expansion in V1.

## Decision gate
For every request and delivered result, with review proportional to the decision, identify the business problem, trace it to the brief, consider the simplest alternative, assess accuracy, cost, security, implementation and maintenance, and classify as APPROVE, ADAPT, DEFER, REJECT, or REVISE. For approved changes, specify acceptance tests and verify results before claiming completion. Drop off-brief scope and record why. Treat a change to the brief as an explicit owner decision. Do not silently expand scope; escalate conflicts with existing architecture and preserve backwards compatibility. No new service or dependency without demonstrated value. Record deferred items separately. Protect outlet identity, owner-only access, accounting history, exact USD decimals and immutable local-currency settlement evidence, retry safety and Baghdad-local reporting boundaries.

## Skill audit decision (V2)
Replace the original WSD Financial Analyst with the single WSD FMCG Financial Engine skill. Adapt relevant concepts from OpenAccountant, Alireza Rezvani and Daloopa without installing their plugins or calling their services. Reject investment tooling and India-specific accounting workflows; defer three-statement accounting, trade-spend accruals, full working capital, inventory turnover and forecasts. Do not add infrastructure. Pricing simulation is a read-only optional calculation, not a blocking MVP UI feature. Verify actual schema and data before implementing or enabling live reports.

## Existing project rules

Follow AGENTS.md for repository access, project filing and task tracking. The Obsidian vault is the reference for requirements and design. Keep GitHub issue state current and use synthetic examples. An attached installation note or methodology reference does not authorize plugins, data transfers, live changes or deployments. The supplied brief refers to a seven-tool stack without enumerating it. No stack changes are approved by this document.

## Integration verdict

Approve the deterministic formulas, data-quality checks and sole-owner operating scope. Adapt the schema design to migrations 001/002, which already define outlets, orders, order lines, payments and visits. Defer runtime reports that require missing data or events. See [the integration review](Obsidian%20Vault/Technical/Finance-engine-V2-review.md).

## Catalog and competitor definitions

The owner permits a shared registry with explicit Our catalog and Competitor classification. Admin alone manages brand, product-line and product definitions, including imports and activation. Future regular users select approved competitors and submit observations. Order posting must validate Our catalog membership and survey posting must validate Competitor membership. The current solo account remains owner-only. See the revised registry rule in the existing database note.
