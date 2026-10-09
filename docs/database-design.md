# Database design

Mongoose schemas live in `src/models/index.js`. MongoDB stores UTC dates and integer paise. References are checked in the service/API layer; identifiers alone do not grant access.

| Collection/model | Key fields                                                                                     | Constraints                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| User             | name, email, phone, passwordHash, role, status                                                 | normalized unique email; hash excluded from normal reads            |
| Vehicle          | userId, registrationNumber, manufacturer, model, connectorType, batteryCapacityKwh, isActive   | owned by customer; soft deactivation                                |
| Station          | name, address, city, state, postalCode, location, timeZone, openingHours, status               | GeoJSON longitude/latitude; 2dsphere index                          |
| Charger          | stationId, chargerCode, connectorType, powerKw, pricePerHourPaise, operationalStatus           | unique stationId + chargerCode                                      |
| Booking          | reference, user/vehicle/station/charger IDs, start/end, status, amount, snapshots, hold expiry | unique bookingReference                                             |
| ReservationBlock | chargerId, blockStartAt, bookingId, state, holdExpiresAt                                       | unique chargerId + blockStartAt                                     |
| Payment          | bookingId, transactionReference, amountPaise, mode, status, idempotencyKey                     | unique booking + key; partial unique successful payment per booking |
| Refund           | bookingId, paymentId, refundReference, amountPaise, mode, processedAt                          | unique bookingId                                                    |
| Review           | bookingId, userId, stationId, rating, comment                                                  | unique bookingId                                                    |
| Notification     | recipientId, bookingId, type, message, readAt                                                  | recipient ownership                                                 |
| sessions         | session data and expiry                                                                        | MongoDB-backed express-session store                                |

Every model includes creation/update timestamps. Station, vehicle and price snapshots preserve historical context.

## Atomic operations

Reservation transactions validate relations and schedules, remove expired claims only for the requested blocks, insert every requested block and create the pending booking. A duplicate claim aborts the entire transaction. MongoDB transient transaction conflicts are retried by the driver; duplicate-key conflicts return 409.

Successful payment writes payment, booking confirmation, confirmed blocks and notifications within one transaction. A successful-payment unique index and idempotency key prevent repeated successful charges. Failure records an attempt while leaving the valid hold pending.

Cancellation writes cancelled status, releases blocks, creates at most one refund and notifies customer/admin in a transaction. Cleanup marks expired pending bookings and removes expired hold blocks. Queries directly exclude timestamp-expired holds, so cleanup delay does not extend availability locks.
