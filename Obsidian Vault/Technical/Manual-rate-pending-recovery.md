# Manual exchange-rate pending recovery

Owner screenshot reported a stuck pending submission on 22 November 2026. Related #12/#13. Verdict: ADAPT — repair local acknowledgment/rejection state without changing rate posting, financial records or retry identity.

## Cause and delta
OwnerAdmin retains one frozen operation after every failure. Editing then Save encounters the different-payload guard; even a definitively rejected expired/invalid rate stays locked. A background sync can also acknowledge the command while leaving the component/localStorage pending pointer behind.

- Before creating a new operation, validate a positive decimal rate and a real future datetime interpreted in Baghdad (UTC+03:00).
- Observe the existing matching command acknowledgment. A matching owner/RPC/request clears the stale local pointer and reloads rates; no extra posting.
- A definitive stored manual-rate validation rejection exposes Correct rejected rate. On that user action, archive the original command under owner-scoped local evidence, then release only that rejected command and local pointer for a new operation. No rate, payment or invoice is deleted.
- Transport loss, missing evidence, identity conflict, other owners and unrelated server errors retain the original operation for exact retry. Generic payment/import pending behavior stays unchanged.
- Disable rate fields/Save while pending so editing cannot silently diverge from the frozen retry request.

## Verification
104 app tests and both app builds pass; six new regressions cover invalid/past/calendar dates, Baghdad conversion, uncertain requests, definitive rejection archive, background acknowledgment, owner/identity checks and exact retry. Existing four lint warnings remain outside this change. No schema or posting logic changed. No agent-published rate or live money operation is part of verification. Rendered/deployment evidence follows release.
