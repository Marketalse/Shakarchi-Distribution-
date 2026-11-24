# Beta scenarios and results

All cases start Not run for independent testers. Unit tests are not a substitute for these gates.

| ID | Who | Scenario | Pass condition | Result |
|---|---|---|---|---|
| B01 | A/B | Sign in with independent invitations | Correct beta version and assigned customers only | Not run |
| B02 | A/B | Attempt other tester's customer/record URL | Denied by server; no details disclosed | Not run |
| B03 | Rep | Open Admin/price/FX/refund controls directly | Denied by server, including direct requests | Not run |
| B04 | Rep | Open catalog/search/half-pack counter/box rollover | Correct quantities and USD totals | Not run |
| B05 | Manager+rep | Upload sample product photo, sync phone | Original background/shadow framing; new reference appears | Owner accepted current owner flow; independent beta not run |
| B06 | Rep | Airplane mode, draft, reload | Prior synced data/draft retained with clear offline state | Independent beta not run |
| B07 | Rep+manager | Reconnect/reopen and sync | One accepted operation visible in beta portal | Not run |
| B08 | Two sessions | Lost response and retry/concurrent reconnect | Stable identity, no duplicate posting or changed frozen payload | Not run |
| B09 | Rep | Review sample order and collection | Cash default,4–10 credit days,$0 initial collection and correct outstanding | Owner accepted solo flow; beta not run |
| B10 | Manager | Reconcile rep sample invoice/receipt | Source records and Admin amounts agree | Not run |
| B11 | A/B | Sign out/switch identity with pending work | A cache/queue not exposed or uploaded as B | Not run |
| B12 | Manager+rep | Revoke tester access and reopen online | Backend denies new work/access; retained queue handled explicitly | Not run |
| B13 | Rep | Open external maps on saved fictional location | Correct destination/provider; phone permission handled | Owner accepted solo flow; beta not run |
| B14 | Rep | Publish-approved sample survey only | Correct template/version, answers incl.zero/false preserved | Pending approved sample template |
| B15 | Rep | Different device/OS and accessibility | Usable layout, keyboard/touch controls and error states | Not run |

Stop immediately on B02/B03/B08/B11 security/ledger failures. Test operation counts against isolated records rather than screenshots alone.
