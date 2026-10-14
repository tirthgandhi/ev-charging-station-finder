# Voltway: complete local setup handoff

Give this entire file to an AI coding assistant with terminal access, or follow it yourself. It contains no owner's login credentials, database credentials, or session secrets. The repository and its lockfile are the source of truth.

## Instructions for the AI assistant

Set up the existing Voltway application locally, including its real frontend, backend, database, authentication, and booking flow. Run the commands, resolve installation errors, and report actual verification results. Preserve existing code, uncommitted work, private `.env`, and database records. Do not replace the application with a mock, run destructive database resets, or claim checks passed without executing them. Never copy private configuration into source, this file, screenshots, logs, commits, or archives. Supply the owner's login separately and privately when requested.

Repository: <https://github.com/tirthgandhi/ev-charging-station-finder>

Branch: `main`. Run commands from the directory containing `package.json`. In some delivered workspaces this directory is named `project`; a fresh clone uses `ev-charging-station-finder`.

## 1. Understand what runs

- Frontend: HTML, CSS, browser JavaScript, Bootstrap and Leaflet, under `public/`.
- Backend: Express 5 and Node.js ES modules, under `src/`.
- Both are served by **one Node process** on **http://localhost:3000**. There is no frontend build command, Vite server, separate frontend port, or CORS setup to add.
- Database: MongoDB with a **replica set**, required for transactional reservations. Standalone MongoDB is insufficient.
- Sessions: stored in MongoDB. Authentication uses cookies and CSRF tokens.
- Payments are simulated. Seed stations are examples, not live charger telemetry.

## 2. Prerequisites and installation

Install Git and Node.js **22.9 or later** (the scripts require `--env-file-if-exists`). Install Docker with Compose v2 for the persistent local database below. On Windows, start Docker Desktop with Linux containers. On Linux, Docker Engine with the Compose plugin is sufficient. Docker is unnecessary if an existing transaction-capable MongoDB/Atlas connection is available.

Check the tools:

```sh
git --version
node --version
npm --version
docker version
docker compose version
```

Internet access is needed for cloning, npm packages, Docker images, and map tiles. Automated tests download a MongoDB binary on first use. Ports 3000 and 27017 must be free for the defaults.

For a fresh checkout:

```sh
git clone --branch main https://github.com/tirthgandhi/ev-charging-station-finder.git
cd ev-charging-station-finder
npm ci
```

For an existing checkout, inspect `git status` first and run `npm ci` in its package directory. Do not overwrite local changes or force a checkout. Install development dependencies too; the tests and preview require them. If only production dependencies were installed, use `npm ci --include=dev`.

## 3. Choose the database

### A. Persistent local MongoDB (recommended for a fresh machine)

The committed `compose.yaml` starts MongoDB 7.0.14, matching the integration-test binary, initializes a single-node replica set named `rs0`, and stores data in a Docker named volume. The database port is published only on local loopback. This unauthenticated database is for local development only.

```sh
docker compose up -d
docker compose ps -a
docker compose logs mongodb-init
docker compose exec mongodb mongosh --quiet --eval 'db.hello().isWritablePrimary'
```

Allow up to two minutes for initialization after the image downloads. Continue only when `mongodb-init` has exited with code 0, `mongodb` is healthy, and the last command returns `true`. If initialization fails, read `docker compose logs mongodb mongodb-init`, correct the cause, and rerun `docker compose up -d`. Do not delete the volume to troubleshoot.

Use this non-secret local connection address:

```text
mongodb://127.0.0.1:27017/evcharge?replicaSet=rs0
```

Keep Node running on the host computer for this Compose configuration. The replica set advertises loopback; moving Node into another container requires a different network configuration.

### B. Existing MongoDB or Atlas

Preserve a working private `.env`. For Atlas, obtain the connection string privately from the owner, including a database name and a database user with access to it. Ensure the current machine is allowed by Atlas network access, and URL-encode special characters in URI credentials. An Atlas website login is different from a database user and from a Voltway application login.

For an existing local installation, confirm it is an initialized replica set. Do not run the Docker database on an already occupied port. Do not point seed or test commands at an unrelated database.

## 4. Configure the private environment

**If `.env` already exists, inspect and preserve it privately. Do not overwrite it.** For a new checkout only, copy the example:

Windows PowerShell:

```powershell
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
```

macOS / Linux:

```sh
test -f .env || cp .env.example .env
```

Edit `.env` locally using the following requirements. The administrator values are deliberately not supplied in this handoff.

| Variable                | Required local setting                                             |
| ----------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`              | `development`                                                      |
| `PORT`                  | `3000`                                                             |
| `HOST`                  | `127.0.0.1`                                                        |
| `APP_BASE_URL`          | `http://localhost:3000`                                            |
| `MONGODB_URI`           | Local replica-set address above, or private Atlas URI              |
| `SESSION_SECRET`        | Independently generated random secret, at least 32 characters      |
| `ADMIN_EMAIL`           | Owner-provided administrator email, entered privately              |
| `ADMIN_PASSWORD`        | Owner-provided or newly generated password, at least 12 characters |
| `BOOKING_HOLD_MINUTES`  | `5`                                                                |
| `BOOKING_HORIZON_DAYS`  | `30`                                                               |
| `BOOKING_BLOCK_MINUTES` | `30`                                                               |

Generate the session secret locally; do not paste its output into a shared transcript:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If the owner has no password for a new installation, generate an independent random password in the same way and save it only in the private `.env` and the owner's password manager. Quote values containing `#` in `.env`. Placeholder values beginning with `replace-` are rejected. Never use the session secret as an account password.

`.env` is Git-ignored. Confirm that before any commit:

```sh
git check-ignore .env
```

## 5. Check, seed, and run both frontend and backend

```sh
npm run db:check
npm run seed
npm start
```

Run each command only after the previous command succeeds. The seed creates six sample stations, twelve chargers, and the configured administrator if absent. It preserves existing records and **does not reset an existing password or promote an existing customer with the same email**. Editing `ADMIN_PASSWORD` after seeding does not change that account's stored password.

Keep the server terminal open. Visit:

- Application: <http://localhost:3000>
- Login: <http://localhost:3000/#/login>
- Administrator: <http://localhost:3000/#/admin>
- Health: <http://localhost:3000/api/health>

The health endpoint must return HTTP 200 and `{"status":"ok"}`. Log in using the private administrator credentials. Public registration always creates a customer. On a fresh local database, accounts and bookings from an existing Atlas database are not copied; the seed creates only the sample records and configured administrator.

Use `npm run dev` instead of `npm start` for automatic restarts while editing. Do not launch both on the same port. Use the same hostname consistently in the browser so cookies remain attached to the same origin.

## 6. Verify the complete application

In a second terminal at the package root:

```sh
npm test
npm run privacy:check
```

`npm test` uses a separate temporary MongoDB replica set and does not require the application's `.env`. It covers API integration, concurrent booking behavior, frontend vehicle selection, and route resolution. It does not replace browser checks. If the test MongoDB binary cannot download or start, report the platform/network error and run `node --test tests/frontend.test.js` separately; do not claim that integration tests passed.

With the server running, check HTTP delivery without installing another tool:

```sh
node --input-type=module -e "for (const p of ['/', '/assets/app.js', '/assets/style.css', '/vendor/bootstrap/css/bootstrap.min.css', '/vendor/leaflet/leaflet.js', '/api/health', '/api/stations']) { const r = await fetch('http://localhost:3000' + p); console.log(r.status, p); if (!r.ok) process.exitCode = 1; }"
```

Then perform browser checks:

1. Open the home page; confirm the layout, station list, filters, map markers, and map tiles load. Check the browser console for errors.
2. Register a new local test customer, log out, and log in again.
3. Save a vehicle with a connector such as CCS2. Open a sample station and select a compatible active charger.
4. Choose a future date and an available green start-time button inside station opening hours. Confirm it turns orange; choose the end time and continue.
5. Complete a simulated successful payment before the five-minute hold expires. Check the saved booking confirmation and booking history.
6. Log in as administrator and verify station, charger, booking, user, payment, and report pages. Confirm the booking is visible.
7. Restart the app and Docker services without deleting the volume. Log in again if necessary and confirm saved records remain.

Record which checks passed and which were blocked. Avoid promising perfect operation on machines or networks that have not been tested. `npm run test:atlas` is optional and creates/deletes a separate disposable test database; use it only with the owner's authorization and database permissions.

## 7. Stop and restart without losing data

Stop Node with Ctrl+C. Stop the local database with:

```sh
docker compose stop
```

Restart later:

```sh
docker compose up -d
npm run db:check
npm start
```

The Docker named volume keeps the data. Do not use `docker compose down -v`, delete the volume, or drop the database unless the owner explicitly requests erasing it. Keep the same `.env`, session secret, and Compose project directory for subsequent runs.

## 8. Troubleshooting

| Symptom                                               | Action                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unknown `--env-file-if-exists` option                 | Install Node 22.9 or later; reopen the terminal and check `node --version`.                                                                                  |
| Docker daemon unavailable                             | Start Docker Desktop/Engine and verify `docker version`.                                                                                                     |
| Port 27017 is occupied                                | Identify the existing database; use its initialized replica set or stop it intentionally before starting Compose.                                            |
| Replica set has no primary                            | Inspect `docker compose logs mongodb-init mongodb`; wait for initialization and verify `isWritablePrimary` is `true`.                                        |
| Transaction numbers are only allowed on a replica set | Replace the standalone MongoDB connection with the initialized replica set or Atlas connection.                                                              |
| MongoDB authentication/DNS/timeout error              | Check the private URI, credentials, network access, and database name; run `npm run db:check`. Do not print the URI into logs.                               |
| `EADDRINUSE` on port 3000                             | Stop the other app intentionally, or change both `PORT` and `APP_BASE_URL` and use the new port throughout the checks.                                       |
| Missing Bootstrap/Leaflet or plain page               | Run `npm ci`; access the app through Express, not by opening `index.html` as a file.                                                                         |
| Login fails after changing `.env`                     | Existing passwords are not reset by seed. Confirm the correct database and original account credentials.                                                     |
| CSRF 403 response                                     | Refresh/login again. API clients must first GET `/api/auth/csrf`, retain cookies, and send `X-CSRF-Token` on writes; use the new token returned after login. |
| Continue does not create a booking                    | Select a compatible active charger and an available future start-time button; resolve the visible validation message.                                        |
| Map tiles are unavailable                             | Check internet access to `tile.openstreetmap.org`. The app has a fallback; report blocked tiles separately from API failures.                                |

## Optional temporary demonstration

`npm run preview` runs an isolated demo with a disposable database and prints its separate demo login. It requires development dependencies and may download MongoDB. Stop any app already using port 3000 first. Preview does not use the owner's configured login and deletes its database on exit; use the persistent setup above for normal local work.

## Completion report for the AI assistant

Return the project path, Node version, chosen database mode, app URL, exact start/restart commands, checks actually executed, and any remaining failures. Keep personal credentials out of this handoff and Git. Share login information separately only with the owner, and distinguish configured credentials from a login you actually verified.

### Handoff verification on 14 October 2026

On the original Windows workspace with Node 26.3.1, all 20 automated tests passed, including successful responses from all 37 declared API endpoints. The source privacy scan and formatting check for the new setup files passed. The temporary test database required execution outside the restricted sandbox. Docker was unavailable on that machine, so the Compose configuration has not been executed there. Browser acceptance checks above remain instructions for the receiving machine, not a claim of a new browser test run.
