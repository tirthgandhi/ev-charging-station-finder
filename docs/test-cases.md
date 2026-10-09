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

Final execution: **nine integration tests passed, zero failures**. Test groups contain multiple assertions. The expanded checks cover persisted records and MongoDB sessions across a fresh application instance, zero-length periods, booking horizon, inactive stations, incompatible vehicles, malformed identifiers and forbidden status transitions. `npm run format:check` also passed. Dependency installation reported zero known vulnerabilities.

## Browser verification

Local isolated demo checked through the Codex browser: station listing, responsive navigation, admin login, vehicle creation, station details and Leaflet map, future slot selection, saved booking summary, successful simulated payment, admin start/complete transitions and matching report totals. The completed-booking review form was also verified on mobile. Desktop viewport: 1440×1000; mobile viewport: 390×844, with no horizontal page overflow. Customer registration and role separation are covered by the database-backed integration suite.

Evidence: [Desktop station finder](screenshots/station-finder-desktop.png), [mobile station finder](screenshots/station-finder-mobile.png), [booking confirmation](screenshots/booking-confirmed.png), [admin dashboard](screenshots/admin-dashboard.png).

## Manual deployment checks

Before deployment, configure a real Atlas URI and private secrets. Confirm the health endpoint, secure HTTPS session cookies, process restart persistence, host logging and backups. Real Atlas connectivity and hosted deployment require the user's environment and are not claimed as verified by local tests. Test geolocation permission denial in the target browser; manual city search remains available independently.
