## Sequential UI/Admin delivery
Related #43, #44, #45, #46, #47. #48 is the next separate task. Existing dependencies #10/#13/#38/#41 remain outside this run.

- #44: responsive admin client directory and editor; Me links Admin hub; profile/location corrections moved to protected admin routes. Existing sole-owner gate/RLS unchanged.
- #45: compact refresh glyph, short dashboard labels, due/overdue reminder indicator and manual FX display. BigInt summary rounding only; exact cents remain in payments/debt/detail.
- #46: relationship/shop-phone inputs hidden without changing stored fields; new records retain prospect default. No field-view COGS card; two-column invoice history links details. Visit completion after content, with guard against bypassing unfinished survey sessions.
- #47: one creation GPS action retains accuracy/time/poor-fix warning; saved-pin Google Maps/Waze links appear alongside retail rows; no GPS on navigation or visits. Explicit correction remains admin-only.

Validation:49 app tests and TypeScript/Vite build passed; synthetic browser verified admin client directory/detail, absent legacy fields, one-action capture, direct exact-coordinate links and revised dashboard/rate. Phone-native handoff and real offline acceptance remain #41. No production records, schema or policies changed; no product/pricing/UOM/survey-definition additions. Existing effect/bundle warnings retained.
