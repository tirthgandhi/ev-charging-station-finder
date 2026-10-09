# API reference

All responses are JSON except CSV export. Errors use `{ "error": "readable message" }` with 400 validation, 401 authentication, 403 authorization/CSRF, 404 missing record, 409 state/conflict, or 500 generic internal failure. Money uses paise. Timestamps are ISO 8601 with an offset, normally UTC `Z`.

Fetch `GET /api/auth/csrf` before mutations. Preserve the session cookie and send the returned token in `X-CSRF-Token`. Login/registration regenerate the session and return a replacement `csrf`. `GET /api/auth/me` returns the current user or null and booking configuration.

| Method and endpoint                      | Input or behavior                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/health                          | database health                                                                                                                    |
| POST /api/auth/register                  | name, email, phone, password (10–128 characters); always customer                                                                  |
| POST /api/auth/login                     | email, password                                                                                                                    |
| POST /api/auth/logout                    | destroy current session                                                                                                            |
| PATCH /api/users/me                      | name, phone                                                                                                                        |
| GET/POST /api/vehicles                   | list owned vehicles / create with registrationNumber, manufacturer, model, vehicleType, connectorType, optional batteryCapacityKwh |
| PATCH /api/vehicles/:id                  | permitted vehicle fields only                                                                                                      |
| DELETE /api/vehicles/:id                 | soft deactivation                                                                                                                  |
| GET /api/stations                        | q, connector, minPower, startAt+endAt, lat+lng query parameters                                                                    |
| GET /api/stations/:id                    | active station and all its charger operational statuses                                                                            |
| GET /api/stations/:id/reviews            | public reviews with author names                                                                                                   |
| GET /api/chargers/:id/availability       | date=YYYY-MM-DD in station time zone; UTC slot boundaries and local labels                                                         |
| POST /api/bookings                       | chargerId, vehicleId, startAt, endAt; server computes price                                                                        |
| GET /api/bookings                        | owned booking history                                                                                                              |
| GET /api/bookings/:id                    | owned booking, payments, refunds and review                                                                                        |
| POST /api/bookings/:id/payments/simulate | outcome=success or failed, idempotencyKey (8–100 characters)                                                                       |
| POST /api/bookings/:id/cancel            | optional reason (500 characters maximum)                                                                                           |
| POST /api/bookings/:id/review            | rating integer 1–5, comment 3–1000 characters                                                                                      |
| GET /api/notifications                   | current recipient's newest 100 notifications                                                                                       |
| PATCH /api/notifications/:id/read        | mark owned notification read                                                                                                       |

## Admin-only endpoints

| Method and endpoint                   | Behavior                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| GET /api/admin/dashboard              | counts and gross/refund/net simulated totals                                     |
| GET /api/admin/stations               | all active/inactive stations                                                     |
| POST /api/admin/stations              | create station (see station schema below)                                        |
| PATCH /api/admin/stations/:id         | update permitted station fields or status                                        |
| GET /api/admin/chargers               | chargers with station names                                                      |
| POST /api/admin/stations/:id/chargers | chargerCode, connectorType, powerKw, pricePerHourPaise, operationalStatus        |
| PATCH /api/admin/chargers/:id         | permitted charger fields                                                         |
| GET /api/admin/users                  | users without password hashes                                                    |
| PATCH /api/admin/users/:id/status     | customer status active/inactive; admin accounts excluded                         |
| GET /api/admin/bookings               | filters from, to, stationId, status                                              |
| PATCH /api/admin/bookings/:id/status  | confirmed → in_progress → completed only                                         |
| GET /api/admin/payments               | payments and refunds labelled simulated                                          |
| GET /api/admin/reports                | same filters; booking groups, reserved hours, payments/refunds and registrations |
| GET /api/admin/reports/export         | same filters; CSV with spreadsheet formula protection                            |

Report dates are inclusive calendar dates in UTC (the `to` date becomes an exclusive next-day boundary). They filter session start timestamps; financial records belong to those matching bookings. Registration counts use the selected dates and are independent of station/status.

```json
{
  "name": "City EV Hub",
  "description": "Demonstration station",
  "address": "Station Road",
  "city": "Vadodara",
  "state": "Gujarat",
  "postalCode": "390001",
  "location": { "type": "Point", "coordinates": [73.1812, 22.3072] },
  "timeZone": "Asia/Kolkata",
  "contactPhone": "+91 9000000000",
  "openingHours": { "open": "06:00", "close": "23:30" },
  "status": "active"
}
```

Connectors: CCS2, Type 2, CHAdeMO, Bharat AC. Charger operational states: active, maintenance, inactive. Station states: active, inactive. Booking states: pending_payment, confirmed, in_progress, completed, cancelled, expired.
