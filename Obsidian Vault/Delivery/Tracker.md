# GitHub tracker
Start at [repository issues](https://github.com/Marketalse/Shakarchi-Distribution-/issues). Phase issue titles carry M1–M6 so they remain queryable. [Roadmap](Roadmap.md) defines exit gates and [project management](Project-management.md) defines status and cadence.

The [Delivery Tracker](https://github.com/users/Marketalse/projects/3) is a private GitHub Project linked to the repository. It imports open issues and starts with the Todo, In Progress and Done board columns. Todo is the intake and planning queue; use issue notes to record review or blocking details. Phase is in the issue title. Add dates only after reforecasting the original plan.

## Seeded issues

- [Approve client profile and capture forms](https://github.com/Marketalse/Shakarchi-Distribution-/issues/7)
- [Review Supabase capture model](https://github.com/Marketalse/Shakarchi-Distribution-/issues/8)
- [Plan PWA capture](https://github.com/Marketalse/Shakarchi-Distribution-/issues/9)
- [Plan market survey](https://github.com/Marketalse/Shakarchi-Distribution-/issues/10)
- [Define field pilot](https://github.com/Marketalse/Shakarchi-Distribution-/issues/11)
- [Define order form and finance rules](https://github.com/Marketalse/Shakarchi-Distribution-/issues/12)
- [Define dashboard metrics](https://github.com/Marketalse/Shakarchi-Distribution-/issues/13)
- [Define advisor brief](https://github.com/Marketalse/Shakarchi-Distribution-/issues/14)

- 2026-11-20 · **#25 implementation verified / release preparation** · Client profile edits preserve identity and saved coordinates, reject stale edits and unauthorized fields. Mobile published forms validate answers and retain uncertain submissions for exact retry; owner form builder and readable survey results added. Competitor observations now use an idempotent RPC. Renumbered candidate to 012 after released GPS 011; merged main without losing location protection. 36 app tests, disposable database 001–012 checks and build passed. #26 reporting/reminders follows; #29 phone acceptance remains pending. Verdict: aligned, no catalog/FX redesign or extra dependency.

- 2026-11-20 · **#25 done / #26 release preparation** · PR #31 merged and deployed. Live migration 012 passed transactional synthetic capture/edit/survey/replay checks, with fixtures rolled back (99 products, zero clients retained). Signed-in production exposes the question builder. Separate local browser fixture passed client edit, published survey submission with zero/false, and form publishing. #26 adds current USD balances, all-time signed cash, per-invoice reconciliation and a due-reminder list using existing views/RPCs; 39 app tests and build passed, and local browser reminder reschedule passed. No finance migration or automatic FX service. #29 remains Review for real-phone GPS/navigation.

- 2026-11-20 · **#25 and #26 done / deployed** · PR #31 (client editing and linked surveys) and PR #32 (USD reports and in-app payment reminders) merged; both production deployments succeeded. 39 app tests, disposable database 001–012 regressions, TypeScript/Vite build and lint passed (effect/bundle warnings retained). Live 012 smoke fixtures rolled back; no live financial records changed. Local browser fixtures verified profile save, survey publish/submit with false/zero, balances and Baghdad reminder reschedule. Signed-in production verified the question builder and new dashboard/reminder state after PWA refresh. GitHub #25/#26 closed and board Done; #29 In Progress for real-phone GPS/native navigation acceptance only. Financial multi-session concurrency remains separate pilot acceptance. Verdict: aligned with solo capture-first brief, existing classified catalog, USD ledger and manual FX; no finance migration or new dependencies.
