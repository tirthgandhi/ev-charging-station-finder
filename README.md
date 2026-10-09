# Voltway — EV Charging Station Finder & Slot Booking

A responsive dark/orange liquid-glass application for AWT and Software Engineering. Built with Node.js, Express, MongoDB/Mongoose, server-side sessions, Bootstrap, vanilla JavaScript and Leaflet.

## Implemented

- Customer registration/login, profile, vehicles and ownership checks.
- City/address search, connector and power filters, time availability, map markers, optional geolocation and distance sorting.
- Time-zone aware reservation slots, atomic MongoDB block claims, five-minute payment holds, saved price/station/vehicle snapshots.
- Simulated success/failure payments with idempotency, booking confirmation/history, cancellation and single simulated refunds.
- Completed-booking reviews and in-app customer/admin notifications.
- Admin station/charger management, customer activation, permitted session transitions, dashboard, filtered reports and CSV exports.
- CSRF protection, bcrypt hashing, login rate limits, session regeneration, MongoDB session storage, security headers and server-side validation.

**Demo payment — no real money will be charged.** The application does not control charging hardware or receive live telemetry. Seed stations are fictional demonstration records.

## Run with persistent MongoDB

Requires Node.js 22+ and MongoDB Atlas (or a local MongoDB replica set). Standalone MongoDB cannot support the transactional booking guarantees.

```powershell
npm install
Copy-Item .env.example .env
# Edit .env with your MongoDB URI, a random SESSION_SECRET,
# ADMIN_EMAIL and a strong ADMIN_PASSWORD.
npm run seed
npm start
```

Open [localhost:3000](http://localhost:3000). The seed command creates six sample stations, twelve chargers and a controlled admin account. It preserves existing records and does not reset an existing admin password. Public registration always creates customers. Keep `.env` private; never commit credentials.

Generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste it into your private `.env`.

## Try the isolated demo

```powershell
npm run preview
```

This starts a temporary local MongoDB replica set and the application at [localhost:3000](http://localhost:3000). The first run downloads MongoDB from its official distribution. The temporary database is deleted when stopped; use the persistent setup above for real project records.

Demo-only administrator: `admin@voltway.demo` / `Voltway-Demo-2026`. These credentials apply only to the isolated preview. Do not deploy the preview script.

## Validation

```powershell
npm test
npm run format:check
```

Tests use a real temporary MongoDB replica set, not a mocked database. They exercise authentication, CSRF, authorization, concurrent booking conflicts, rollback, adjacent periods, expired holds, payment retries, cancellation/refund idempotency, reviews, reports and session persistence. See [test cases](docs/test-cases.md) for results and browser checks.

## Source structure

```text
src/
  app.js                 HTTP API, middleware and authorization
  server.js              configuration, connection and process lifecycle
  config.js              environment validation
  validation.js          explicit request schemas
  models/index.js        collections and indexes
  services/booking.js    transactional reservation/payment/cancellation logic
public/
  index.html             application shell
  assets/app.js          customer screens and routing
  assets/admin.js        admin screens
  assets/api.js          API client and safe presentation helpers
  assets/style.css       responsive liquid-glass visual system
scripts/                 controlled seed and isolated preview
tests/                   database-backed integration tests
docs/                    requirements, architecture, APIs, diagrams and test evidence
```

## Booking policies

Default intervals are 30 minutes, the horizon is 30 days and payment holds last five minutes. Environment variables configure these values. Prices are integer paise, computed by the backend and saved at reservation time. Timestamps are stored in UTC; booking screens use the station time zone. Search datetime filters use the browser's local zone and send UTC. Report date boundaries use UTC; the dashboard's today count uses Asia/Kolkata.

Availability starts at the first aligned block within opening hours. The initial version supports a single daily opening window and no overnight window. A customer can cancel pending/confirmed bookings before their start; paid cancellations produce a full simulated refund. Only the admin can mark confirmed → in progress → completed, including early transitions for classroom demonstrations. Completed bookings accept one review each.

## Deployment

Use a Node.js host, Atlas connectivity and HTTPS. Set `NODE_ENV=production`, `MONGODB_URI`, `SESSION_SECRET`, `APP_BASE_URL=https://your-host`, and `PORT`. Configure exactly one trusted reverse proxy hop (as assumed by this app), restricted database network access and a least-privilege database user. Run `npm ci --omit=dev`, then `npm start`. Seed from a controlled environment before removing seed-only admin variables from the runtime.

`GET /api/health` returns 200 only while MongoDB is connected. An in-process cleanup job expires holds every 30 seconds; availability and payment checks also compare expiry timestamps and do not depend on cleanup timing. For hosts that suspend processes, schedule equivalent cleanup when running; booking correctness remains protected by timestamp checks and transactional claims.

Sessions are stored in MongoDB, cookies are HTTP-only/SameSite and secure in production. Preserve the session secret across restarts. Configure host log collection, alerting and database backups. OpenStreetMap tiles include attribution; select a tile service suitable for production traffic and update the CSP allowlist if changing providers.

Deployment and a persistent Atlas connection are **not provisioned by this repository**. No real credentials are included.

## Academic documentation

- [Implementation parts](docs/implementation-plan.md)
- [Requirements and limitations](docs/requirements.md)
- [Database design](docs/database-design.md)
- [API reference](docs/api.md)
- [Architecture and SE diagrams](docs/diagrams.md)
- [Test cases and results](docs/test-cases.md)

Future extensions include operator accounts, hardware telemetry, QR check-in, real payment integration, notifications by email/SMS and measured energy billing.
