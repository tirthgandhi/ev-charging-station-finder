# Atlas API verification

Verified on 10 October 2026 (Asia/Calcutta).

- Atlas authentication, ping and transaction-capable cluster: passed.
- Atlas API integration suite: 13 passed, 0 failed.
- Local replica-set regression suite: 13 passed, 0 failed.
- All 37 declared API endpoints returned successful responses.
- Uniquely named test database was removed after the suite; application records were not used as test fixtures.
- Application database seeded with six demonstration stations, twelve chargers and one controlled administrator.
- Credentials remain in the private local .env and are excluded from this report and the final ZIP.

Coverage means every declared route was exercised successfully; it does not claim every possible input combination was tested. Security, conflict and lifecycle cases have additional assertions in tests/integration.test.js.

| API endpoint                             | Observed route response codes |
| ---------------------------------------- | ----------------------------- |
| DELETE /api/vehicles/:id                 | 200                           |
| GET /api/admin/bookings                  | 200                           |
| GET /api/admin/chargers                  | 200                           |
| GET /api/admin/dashboard                 | 200                           |
| GET /api/admin/payments                  | 200                           |
| GET /api/admin/reports                   | 200                           |
| GET /api/admin/reports/export            | 200                           |
| GET /api/admin/stations                  | 200                           |
| GET /api/admin/users                     | 200                           |
| GET /api/auth/csrf                       | 200                           |
| GET /api/auth/me                         | 200                           |
| GET /api/bookings                        | 200, 401                      |
| GET /api/bookings/:id                    | 200                           |
| GET /api/chargers/:id/availability       | 200, 400                      |
| GET /api/health                          | 200                           |
| GET /api/notifications                   | 200                           |
| GET /api/stations                        | 200                           |
| GET /api/stations/:id                    | 200                           |
| GET /api/stations/:id/reviews            | 200                           |
| GET /api/vehicles                        | 200, 401                      |
| PATCH /api/admin/bookings/:id/status     | 200, 409                      |
| PATCH /api/admin/chargers/:id            | 200                           |
| PATCH /api/admin/stations/:id            | 200                           |
| PATCH /api/admin/users/:id/status        | 200                           |
| PATCH /api/notifications/:id/read        | 200                           |
| PATCH /api/users/me                      | 200                           |
| PATCH /api/vehicles/:id                  | 200                           |
| POST /api/admin/stations                 | 201                           |
| POST /api/admin/stations/:id/chargers    | 201                           |
| POST /api/auth/login                     | 200, 401                      |
| POST /api/auth/logout                    | 200                           |
| POST /api/auth/register                  | 201, 409                      |
| POST /api/bookings                       | 201, 400, 401, 404, 409       |
| POST /api/bookings/:id/cancel            | 200, 409                      |
| POST /api/bookings/:id/payments/simulate | 200, 404, 409                 |
| POST /api/bookings/:id/review            | 201, 403, 409                 |
| POST /api/vehicles                       | 201                           |

Middleware rejection tests additionally cover CSRF, role authorization and HTTP 429 login throttling. Those responses occur before route handlers, so they are not listed in the route-status table.

## Verification limits

The API suite uses the real Express application and Atlas database through Supertest. A separate normal server-start command could not run because automatic approval review reached its usage limit. Start the configured application with npm start. Earlier browser screenshots document the isolated local demonstration. No public deployment or GitHub visibility change was performed.
