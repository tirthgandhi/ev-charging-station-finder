# Route contract

Client routes are defined in `public/assets/routes.js`. Unknown paths and invalid record identifiers show Page not found. Customer routes require login; admin routes additionally require the admin role. The backend independently enforces permissions on every protected API.

| Route                | Access          | Purpose                                                           |
| -------------------- | --------------- | ----------------------------------------------------------------- |
| #/                   | Public          | Station finder                                                    |
| #/login, #/register  | Public          | Authentication                                                    |
| #/station/:id        | Public          | Details and slot selection                                        |
| #/booking/:id        | Signed-in owner | Summary, demo payment and review                                  |
| #/bookings           | Signed-in       | Booking history                                                   |
| #/vehicles           | Signed-in       | Save, edit and deactivate vehicles                                |
| #/profile            | Signed-in       | Profile                                                           |
| #/notifications      | Signed-in       | Notifications                                                     |
| #/admin              | Admin           | Dashboard                                                         |
| #/admin/:page        | Admin           | dashboard, stations, chargers, bookings, users, payments, reports |
| #/admin/stations/:id | Admin           | Edit station                                                      |
| #/admin/chargers/:id | Admin           | Edit charger                                                      |

Record IDs must be 24 hexadecimal characters. See [API reference](api.md) for all 37 backend endpoints and [Atlas verification](atlas-verification.md) for prior integration results.

Booking lists every active vehicle belonging to the signed-in user. A newly saved vehicle is preferred when entering the station page, and a matching operational charger is selected automatically. Unsupported vehicles remain visible with a connector mismatch explanation; the frontend and backend both prevent incompatible reservations. Saving a vehicle from a station returns to that station and reloads saved records.

All customer and admin surfaces share glass styling, with an opaque fallback where backdrop filtering is unavailable.
