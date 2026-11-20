# Roadmap
The Notion day plan below is historical planning context; revise dates after approval. Current baseline is Blueprint awaiting owner sign-off; implementation evidence must be checked independently.

| Phase | Original target | Exit gate |
|---|---|---|
| M1 Blueprint | 14 Nov 2026 | Owner accepts minimum capture fields and pilot scope; survey and finance decisions can follow |
| M2 Database | 15 Nov 2026 | Capture schema and permissions reviewed; deduplicated outlet inputs and synthetic reconciliation; catalog follows separately |
| M3 Visit app | 16–19 Nov 2026 | Outlet and basic visit capture first; survey second; reconnect and duplicate-free retries demonstrated on phone |
| M4 Field test | 20–21 Nov 2026 | Real pilot evidence, timing, simplification and independent review; owner approves team rollout |
| M5 Dashboard | 22 Nov 2026 | Sales, collections, overdue and area coverage reconcile with agreed database definitions |
| M6 AI advisor | 23 Nov 2026 | First approved test brief; evaluate usefulness after enough data (original checkpoint 23 Jan 2027) |

## Current delivery order (16 Nov 2026)
1. **M1 / M2 / M3A — Capture foundation:** agree the minimum client profile, outlet and visit form fields; review the Supabase schema and permissions; then prove that the PWA can save and sync client, outlet and visit records without duplicates. Start with synthetic evidence before collecting live records.
2. **M3B — Market survey:** add client selection, survey type, a question list, managed brands and linked answers; pilot the form with the capture flow.
3. **M4 — Field pilot:** validate data completeness, timing and poor-signal behavior; decide when to expand users.
4. **Separate follow-on work:** orders and collections proceed after finance rules are approved. They are not launch gates for capture or the survey. M5 and M6 use agreed metrics as reliable data becomes available.

## M1 requirements acceptance — 20 November 2026

Client-profile requirements for [#7](https://github.com/Marketalse/Shakarchi-Distribution-/issues/7) are finalized in [the accepted field contract](../Product/Form-workflows.md#m1-client-profile-acceptance). Creation/update identity, optional contacts, duplicate warnings and location correction use the implemented solo model. Phone navigation acceptance stays in #29; closing M1 does not close the field pilot.
