# Separate accounting expansion — scope only

Owner approved scoping on 22 November 2026 after the built/planned finance audit. This is a future accounting phase, separate from M5 reporting and M6 advisor evaluation. No schema, service, supplier/stock data entry or posting implementation is authorized by this note alone.

## Existing foundation
USD issued invoices, immutable line price/cost snapshots, signed customer receipts/refunds/corrections, receivables and manual IQD settlement evidence. New M5 reports use recorded invoice gross profit; they exclude operating expenses and are not a full P&L. Customer net collections are not cash in bank or a cash flow statement.

## Dependency order and deliverables
1. **Accounting policy and opening balances:** decide accrual recognition, fiscal calendar, chart of accounts, cash/bank accounts, source evidence, opening assets/liabilities/equity and reconciliation responsibility. Tax and statutory requirements need jurisdiction-specific review; no assumed tax regime.
2. **Purchases and supplier payables:** supplier identity, purchase bills/credits, due dates, settlements and immutable correction evidence; supplier aging reconciles per bill without netting unrelated credits. Avoid duplicating customer invoices/receipts.
3. **Inventory movements and valuation:** opening quantities, receipts, sales issues, transfers, verified returns and write-offs. Agree a valuation method before computing stock value or inventory turnover. Do not backfill movements or guess old packaging.
4. **Operating expenses and cash/bank:** recorded expenses and supplier payments, reconciled accounts, owner funding/drawings, loans and assets. Distinguish noncash events and avoid counting supplier bills and payments twice.
5. **Financial statements:** accrual income statement (revenue, reliable COGS, expenses, net profit), balance sheet (assets = liabilities + equity), cash flow statement (operating/investing/financing movements, opening-to-closing cash reconciliation). Period close and immutable correction/adjustment rules required.
6. **Planning and ratios:** budget versions, budget-vs-actual and explicit forecast assumptions only after reliable sources exist. Inventory turnover, DSO/DPO and cash conversion cycle require comparable periods and supported balances; undefined denominators stay unavailable.

## Acceptance before implementation/release
- Review the accounting/data model against actual source coverage and existing USD/FX rules.
- Define initial imports, audit trail, reversal policy and historical cutoff handling.
- Specify permissions and bank/cost data privacy; owner-only remains the current operating model.
- Use disposable synthetic double-entry fixtures and independent statement reconciliation; no automatic live financial posting.
- Define exports and accountant review separately from operational dashboard acceptance.

## Open owner decisions for the later phase
Whether to integrate with an accounting package or extend the app; inventory valuation policy; opening date/balances; which cash/bank accounts and supplier documents will be maintained; who reviews the accounting statements. No external integration, dependency or cost is introduced by this scope.
