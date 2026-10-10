# Test cases and verification

Run `npm test` to recreate a temporary MongoDB replica set and test the actual Express endpoints. The suite automatically closes its session/database clients and removes the temporary database.

## Automated checks

| Area                    | Checks                                                                                                                        | Result |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| Authentication          | valid registration, normalized duplicate rejection, incorrect credentials, public role escalation blocked                     | Passed |
| Access                  | anonymous booking denied, customer admin access denied, CSRF required, foreign vehicle/payment rejected, inactive user denied | Passed |
| Reservation consistency | simultaneous overlap produces one winner, adjacent periods accepted, partial multi-block conflict rolls back                  | Passed |
| Validation              | past, unaligned, outside-hours periods and maintenance chargers rejected                                                      | Passed |
| Payments                | failed attempt retains hold, success confirms, repeated success creates one successful record                                 | Passed |
| Cancellation            | blocks released, full simulated refund, repeated cancellation creates one refund, completed cancellation denied               | Passed |
| Expiry                  | expired payment rejected, expired claim immediately replaceable, cleanup marks booking expired                                | Passed |
| Full scenario           | confirmation, admin start/complete, review eligibility and uniqueness, notification creation                                  | Passed |
| Search/reporting        | city/connector/power search, occupied availability, filtered reports and CSV totals                                           | Passed |

Final Atlas execution on 10 October 2026: **13 integration test groups passed, zero failures; all 37 declared API endpoints produced successful responses**. The same expanded suite also passed against a local replica set. The checks cover persisted records and MongoDB sessions across a fresh application instance, zero-length periods, booking horizon, inactive stations, incompatible vehicles, malformed identifiers, forbidden status transitions, all customer/admin read/update routes, rate limiting and private-file access denial. Test groups contain multiple assertions. See [the endpoint verification report](atlas-verification.md). Dependency installation previously reported zero known vulnerabilities.

## Browser verification

## Vehicle and route regression update

After correcting hidden vehicles and introducing the explicit client route registry, all seven focused frontend logic tests passed. These cover newly saved CCS2 vehicles with an AC-first charger list, changing vehicles, unsupported connectors remaining visible, empty/inactive vehicles, maintenance chargers and valid/invalid customer/admin routes. The Atlas integration suite was rerun successfully: 13 test groups passed, with successful responses from all 37 API routes, including the updated map response-header assertions. The disposable Atlas test database was removed. Formatting and credential-leak checks passed. The refreshed glass styling is applied through shared CSS; a new visual browser pass has not been performed for this update.

### Earlier browser verification

Local isolated demo checked through the Codex browser: station listing, responsive navigation, admin login, vehicle creation, station details and Leaflet map, future slot selection, saved booking summary, successful simulated payment, admin start/complete transitions and matching report totals. The completed-booking review form was also verified on mobile. Desktop viewport: 1440×1000; mobile viewport: 390×844, with no horizontal page overflow. Customer registration and role separation are covered by the database-backed integration suite.

Evidence: [Desktop station finder](screenshots/station-finder-desktop.png), [mobile station finder](screenshots/station-finder-mobile.png), [booking confirmation](screenshots/booking-confirmed.png), [admin dashboard](screenshots/admin-dashboard.png).

## Manual deployment checks

Atlas authentication, ping and replica-set capability were verified using the private local configuration. The application database was seeded successfully. The separate normal server-start check was not executed because automatic approval review reached its usage limit. API tests did run the actual Express application with Atlas-backed records and sessions; this is distinct from validating a deployed host. Public hosting, HTTPS cookies, host logging and backups remain deployment tasks. The earlier UI screenshots use the isolated local demo, not Atlas. Test geolocation permission denial in the target browser; manual city search remains available independently.
