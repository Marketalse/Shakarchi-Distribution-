# Approved rolling counter and Cash defaults

21November2026. Owner approved the explicit counter/readout plan, with credit4–10days and collection starting at$0.0.

- Only −/+ controls; step0.5Pack. Standard rollover at10Packs, not10HalfPacks. Per-SKU packs_per_box determines the actual threshold.
- Display explicit packaging:1Box ·2Packs ·½Pack; never interpret1.2as composite digits. Counter, review and new invoice quantities share the formatter. Posting remains integer half-packs with frozen conversion snapshots.
- Fresh order defaults: Cash due today, collection0.0USD. Optional credit4through10whole days. Collection amount independently determines Unpaid/Partially paid/Paid and remaining USD balance. No Paid shortcut auto-fills collection.
- Reset to Cash/0.0for a genuinely new order after success. Uncertain saved requests show their frozen terms and collection; new defaults never rewrite them.
- Migration016 checks new term limits after exact accepted-operation replay; historical due dates, invoices, cash and FX snapshots stay unchanged. Unsupported unposted terms are retained for explicit review. No down-migration that rewrites finance history.

Validation:72app tests, both builds, disposable001–016 regressions, four existing lint warnings. No rendered/phone acceptance claimed: #58 browser environment remains blocked. Existing #38/#41 phone evidence gates remain separate.
