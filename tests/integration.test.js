import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app.js';
import * as M from '../src/models/index.js';
import { expireHolds } from '../src/services/booking.js';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
let repl, app, customer, other, admin, station, charger, vehicle, csrf, otherCsrf, adminCsrf;
let ownsTestDatabase = false;
const atlasMode = process.env.TEST_DATABASE_MODE === 'atlas';
const coverage = new Map();
function instrumentApplication(application) {
  const wrapped = (req, res) => {
    res.on('finish', () => {
      if (!req.route?.path) return;
      const prefix =
        req.originalUrl.startsWith('/api/admin/') && !req.route.path.startsWith('/api/')
          ? '/api/admin'
          : '';
      const route = `${req.method} ${prefix}${req.route.path}`;
      if (!coverage.has(route)) coverage.set(route, new Set());
      coverage.get(route).add(res.statusCode);
    });
    application(req, res);
  };
  wrapped.locals = application.locals;
  return wrapped;
}
const cfg = {
  secret: 'integration-test-secret-at-least-32-characters',
  holdMinutes: 5,
  horizonDays: 30,
  blockMinutes: 30,
};
const tomorrow = DateTime.now()
  .setZone('Asia/Kolkata')
  .plus({ days: 1 })
  .startOf('day')
  .set({ hour: 10 });
const input = (offset = 0, length = 60) => ({
  chargerId: String(charger._id),
  vehicleId: String(vehicle._id),
  startAt: tomorrow.plus({ minutes: offset }).toUTC().toISO(),
  endAt: tomorrow
    .plus({ minutes: offset + length })
    .toUTC()
    .toISO(),
});
const post = (url, data, agent = customer, token = csrf) =>
  agent.post(url).set('X-CSRF-Token', token).send(data);
before(
  async () => {
    if (atlasMode) {
      const name = process.env.TEST_DATABASE_NAME;
      assert.match(name || '', /^voltway_test_[a-f0-9]{24}$/);
      const uri = new URL(process.env.TEST_MONGODB_URI);
      assert.equal(uri.pathname, `/${name}`);
      cfg.mongoUri = uri.toString();
    } else {
      repl = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: { version: '7.0.14' },
      });
      cfg.mongoUri = repl.getUri();
    }
    try {
      await mongoose.connect(cfg.mongoUri, { serverSelectionTimeoutMS: 15000 });
    } catch {
      throw new Error(
        'Test database connection failed. Check private configuration and Atlas access.',
      );
    }
    if (atlasMode) {
      assert.equal(mongoose.connection.name, process.env.TEST_DATABASE_NAME);
      assert.equal(
        (await mongoose.connection.db.listCollections().toArray()).length,
        0,
        'Refusing to modify an existing test database',
      );
      ownsTestDatabase = true;
    }
    await M.initializeModels();
    app = instrumentApplication(createApp(cfg));
    customer = request.agent(app);
    other = request.agent(app);
    admin = request.agent(app);
    async function register(agent, email) {
      const token = (await agent.get('/api/auth/csrf')).body.token;
      const r = await agent.post('/api/auth/register').set('X-CSRF-Token', token).send({
        name: 'Test driver',
        email,
        phone: '9000000000',
        password: 'test-password-123',
        role: 'admin',
      });
      assert.equal(r.status, 201);
      assert.equal(r.body.user.role, 'customer');
      return r.body.csrf;
    }
    csrf = await register(customer, 'driver@example.com');
    otherCsrf = await register(other, 'other@example.com');
    adminCsrf = await register(admin, 'admin@example.com');
    await M.User.updateOne({ email: 'admin@example.com' }, { $set: { role: 'admin' } });
    const s = await post(
      '/api/admin/stations',
      {
        name: 'Test Station',
        description: 'Demo',
        address: 'Station Road',
        city: 'Vadodara',
        state: 'Gujarat',
        postalCode: '390001',
        location: { type: 'Point', coordinates: [73.18, 22.3] },
        timeZone: 'Asia/Kolkata',
        contactPhone: '9000000000',
        openingHours: { open: '06:00', close: '23:30' },
      },
      admin,
      adminCsrf,
    );
    assert.equal(s.status, 201);
    station = s.body;
    const c = await post(
      `/api/admin/stations/${station._id}/chargers`,
      { chargerCode: 'DC-01', connectorType: 'CCS2', powerKw: 60, pricePerHourPaise: 12000 },
      admin,
      adminCsrf,
    );
    assert.equal(c.status, 201);
    charger = c.body;
    const v = await post('/api/vehicles', {
      registrationNumber: 'GJ06EV1234',
      manufacturer: 'Tata',
      model: 'Nexon',
      vehicleType: 'car',
      connectorType: 'CCS2',
    });
    assert.equal(v.status, 201);
    vehicle = v.body;
  },
  { timeout: 180000 },
);
after(async () => {
  try {
    if (app) await app.locals.sessionStore.close();
    if (atlasMode && ownsTestDatabase) {
      assert.equal(mongoose.connection.name, process.env.TEST_DATABASE_NAME);
      assert.match(mongoose.connection.name, /^voltway_test_[a-f0-9]{24}$/);
      await mongoose.connection.dropDatabase();
      console.log('Isolated Atlas test database removed; application database was not touched.');
    }
  } finally {
    await mongoose.disconnect();
    if (repl) await repl.stop();
    await mkdir('test-results', { recursive: true });
    await writeFile(
      `test-results/api-coverage-${atlasMode ? 'atlas' : 'local'}.json`,
      JSON.stringify(
        {
          mode: atlasMode ? 'atlas' : 'local',
          checkedAt: new Date().toISOString(),
          routes: [...coverage]
            .sort()
            .map(([route, statuses]) => ({ route, statuses: [...statuses].sort() })),
        },
        null,
        2,
      ),
    );
  }
});
test('authentication, CSRF, ownership and roles are enforced', async () => {
  assert.equal((await customer.get('/api/admin/users')).status, 403);
  assert.equal((await customer.post('/api/vehicles').send({})).status, 403);
  const guest = request.agent(app),
    t = (await guest.get('/api/auth/csrf')).body.token;
  assert.equal((await post('/api/bookings', input(), guest, t)).status, 401);
  assert.equal(
    (
      await post('/api/auth/register', {
        name: 'Duplicate',
        email: 'DRIVER@example.com',
        phone: '9000000000',
        password: 'test-password-123',
      })
    ).status,
    409,
  );
  assert.equal(
    (await post('/api/auth/login', { email: 'driver@example.com', password: 'wrong' })).status,
    401,
  );
  assert.equal((await post('/api/bookings', input(), other, otherCsrf)).status, 404);
});
test('concurrent requests cannot double-book; adjacent periods work; partial claims roll back', async () => {
  const results = await Promise.all([
    post('/api/bookings', input()),
    post('/api/bookings', input()),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await M.Block.countDocuments(), 2);
  assert.equal((await post('/api/bookings', input(60))).status, 201);
  assert.equal((await post('/api/bookings', input(-30, 60))).status, 409);
  assert.equal(
    await M.Block.countDocuments({ blockStartAt: tomorrow.minus({ minutes: 30 }).toJSDate() }),
    0,
  );
});
test('period validation and operational status', async () => {
  assert.equal(
    (
      await post('/api/bookings', {
        ...input(180),
        startAt: new Date(Date.now() - 60000).toISOString(),
      })
    ).status,
    400,
  );
  assert.equal((await post('/api/bookings', input(181))).status, 400);
  assert.equal((await post('/api/bookings', input(-300))).status, 400);
  await M.Charger.updateOne({ _id: charger._id }, { $set: { operationalStatus: 'maintenance' } });
  assert.equal((await post('/api/bookings', input(180))).status, 409);
  await M.Charger.updateOne({ _id: charger._id }, { $set: { operationalStatus: 'active' } });
});
test('failed payment, successful retries, cancellation and one simulated refund', async () => {
  const b = (await post('/api/bookings', input(180))).body;
  const url = `/api/bookings/${b._id}/payments/simulate`;
  assert.equal(
    (await post(url, { outcome: 'success', idempotencyKey: 'foreign-key' }, other, otherCsrf))
      .status,
    404,
  );
  let r = await post(url, { outcome: 'failed', idempotencyKey: 'failed-attempt' });
  assert.equal(r.body.booking.status, 'pending_payment');
  r = await post(url, { outcome: 'success', idempotencyKey: 'success-attempt' });
  assert.equal(r.body.booking.status, 'confirmed');
  await post(url, { outcome: 'success', idempotencyKey: 'another-attempt' });
  assert.equal(await M.Payment.countDocuments({ bookingId: b._id, status: 'success' }), 1);
  assert.equal((await post(`/api/bookings/${b._id}/cancel`, {})).status, 200);
  await post(`/api/bookings/${b._id}/cancel`, {});
  assert.equal(await M.Refund.countDocuments({ bookingId: b._id }), 1);
  assert.equal(await M.Block.countDocuments({ bookingId: b._id }), 0);
});
test('expired holds cannot be paid and immediately allow a replacement reservation', async () => {
  const b = (await post('/api/bookings', input(300))).body;
  await M.Booking.updateOne({ _id: b._id }, { $set: { holdExpiresAt: new Date(0) } });
  await M.Block.updateMany({ bookingId: b._id }, { $set: { holdExpiresAt: new Date(0) } });
  assert.equal(
    (
      await post(`/api/bookings/${b._id}/payments/simulate`, {
        outcome: 'success',
        idempotencyKey: 'expired-attempt',
      })
    ).status,
    409,
  );
  assert.equal((await post('/api/bookings', input(300))).status, 201);
  await expireHolds();
  assert.equal((await M.Booking.findById(b._id)).status, 'expired');
});
test('complete demonstration: confirmation, admin transitions, review, reporting', async () => {
  const b = (await post('/api/bookings', input(420))).body;
  assert.equal(
    (await post(`/api/bookings/${b._id}/review`, { rating: 5, comment: 'Great station' })).status,
    403,
  );
  await post(`/api/bookings/${b._id}/payments/simulate`, {
    outcome: 'success',
    idempotencyKey: 'demo-success',
  });
  for (const status of ['in_progress', 'completed']) {
    const r = await admin
      .patch(`/api/admin/bookings/${b._id}/status`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ status });
    assert.equal(r.status, 200);
  }
  assert.equal((await post(`/api/bookings/${b._id}/cancel`, {})).status, 409);
  assert.equal(
    (await post(`/api/bookings/${b._id}/review`, { rating: 5, comment: 'Great station' })).status,
    201,
  );
  assert.equal(
    (await post(`/api/bookings/${b._id}/review`, { rating: 4, comment: 'Second review' })).status,
    409,
  );
  const reports = await admin.get(`/api/admin/reports?stationId=${station._id}&status=completed`);
  assert.equal(reports.body.bookings.length, 1);
  assert.equal(reports.body.netPaise, 12000);
  const csv = await admin.get('/api/admin/reports/export?status=completed');
  assert.match(csv.text, /simulated/);
  assert.match(csv.text, new RegExp(b.bookingReference));
  assert.equal((await customer.get('/api/notifications')).body.length > 0, true);
});
test('search, availability, profile and customer deactivation', async () => {
  const search = await customer.get('/api/stations?q=Vadodara&connector=CCS2&minPower=50');
  assert.equal(search.body.length, 1);
  const slots = await customer.get(
    `/api/chargers/${charger._id}/availability?date=${tomorrow.toISODate()}`,
  );
  assert.equal(slots.body.slots.find((s) => s.label === '10:00').available, false);
  assert.equal(
    (
      await customer
        .patch('/api/users/me')
        .set('X-CSRF-Token', csrf)
        .send({ name: 'Updated Driver', phone: '9999999999', role: 'admin' })
    ).body.role,
    'customer',
  );
  const user = await M.User.findOne({ email: 'other@example.com' });
  await admin
    .patch(`/api/admin/users/${user._id}/status`)
    .set('X-CSRF-Token', adminCsrf)
    .send({ status: 'inactive' });
  assert.equal((await other.get('/api/vehicles')).status, 401);
});

test('a fresh application instance retrieves existing records and MongoDB session', async () => {
  const agent = request.agent(app);
  const token = (await agent.get('/api/auth/csrf')).body.token;
  const login = await post(
    '/api/auth/login',
    { email: 'driver@example.com', password: 'test-password-123' },
    agent,
    token,
  );
  assert.equal(login.status, 200);
  const restarted = createApp(cfg);
  try {
    const cookie = login.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
    const records = await request(restarted).get('/api/bookings').set('Cookie', cookie);
    assert.equal(records.status, 200);
    assert.ok(records.body.length >= 5);
    assert.ok(records.body.some((booking) => booking.status === 'completed'));
    const me = await request(restarted).get('/api/auth/me').set('Cookie', cookie);
    assert.equal(me.body.user.email, 'driver@example.com');
  } finally {
    await restarted.locals.sessionStore.close();
  }
});

test('invalid durations, horizon, station status, incompatible vehicles and transitions are rejected', async () => {
  assert.equal((await post('/api/bookings', input(600, 0))).status, 400);
  assert.equal(
    (
      await post('/api/bookings', {
        ...input(),
        startAt: tomorrow.plus({ days: 40 }).toUTC().toISO(),
        endAt: tomorrow.plus({ days: 40, hours: 1 }).toUTC().toISO(),
      })
    ).status,
    400,
  );
  await M.Station.updateOne({ _id: station._id }, { $set: { status: 'inactive' } });
  assert.equal((await post('/api/bookings', input(600))).status, 409);
  await M.Station.updateOne({ _id: station._id }, { $set: { status: 'active' } });
  await M.Vehicle.updateOne({ _id: vehicle._id }, { $set: { connectorType: 'Type 2' } });
  assert.equal((await post('/api/bookings', input(600))).status, 400);
  await M.Vehicle.updateOne({ _id: vehicle._id }, { $set: { connectorType: 'CCS2' } });
  const cancelled = await M.Booking.findOne({ status: 'cancelled' });
  const transition = await admin
    .patch(`/api/admin/bookings/${cancelled._id}/status`)
    .set('X-CSRF-Token', adminCsrf)
    .send({ status: 'completed' });
  assert.equal(transition.status, 409);
  assert.equal(
    (await customer.get('/api/chargers/not-an-id/availability?date=2026-10-10')).status,
    400,
  );
});

test('remaining customer APIs: details, vehicle editing/deactivation, notifications, and logout', async () => {
  assert.equal((await customer.get('/api/health')).body.status, 'ok');
  assert.equal((await customer.get('/api/auth/me')).body.user.role, 'customer');
  const list = await customer.get('/api/vehicles');
  assert.equal(list.status, 200);
  assert.ok(list.body.some((v) => v._id === vehicle._id));
  const edited = await customer
    .patch(`/api/vehicles/${vehicle._id}`)
    .set('X-CSRF-Token', csrf)
    .send({ model: 'Nexon Updated' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.model, 'Nexon Updated');
  const details = await customer.get(`/api/stations/${station._id}`);
  assert.equal(details.status, 200);
  assert.equal(details.body.chargers.length, 1);
  const reviews = await customer.get(`/api/stations/${station._id}/reviews`);
  assert.equal(reviews.status, 200);
  assert.equal(reviews.body.length, 1);
  assert.equal('passwordHash' in reviews.body[0].userId, false);
  const bookings = await customer.get('/api/bookings');
  assert.equal(bookings.status, 200);
  const completed = bookings.body.find((b) => b.status === 'completed');
  const booking = await customer.get(`/api/bookings/${completed._id}`);
  assert.equal(booking.status, 200);
  assert.equal(booking.body.payments[0].mode, 'simulated');
  assert.equal(booking.body.review.rating, 5);
  const notifications = await customer.get('/api/notifications');
  const marked = await customer
    .patch(`/api/notifications/${notifications.body[0]._id}/read`)
    .set('X-CSRF-Token', csrf)
    .send({});
  assert.equal(marked.status, 200);
  assert.ok(marked.body.readAt);
  const removed = await customer.delete(`/api/vehicles/${vehicle._id}`).set('X-CSRF-Token', csrf);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.isActive, false);
  assert.equal(
    (await customer.get(`/api/bookings/${completed._id}`)).body.vehicleSnapshot.model,
    'Nexon',
  );
  const signedOut = request.agent(app);
  const token = (await signedOut.get('/api/auth/csrf')).body.token;
  const login = await post(
    '/api/auth/login',
    { email: 'driver@example.com', password: 'test-password-123' },
    signedOut,
    token,
  );
  assert.equal(login.status, 200);
  assert.equal((await post('/api/auth/logout', {}, signedOut, login.body.csrf)).status, 200);
  assert.equal((await signedOut.get('/api/auth/me')).body.user, null);
  assert.equal((await signedOut.get('/api/bookings')).status, 401);
});

test('every admin read/update API returns consistent records and hides password hashes', async () => {
  const stations = await admin.get('/api/admin/stations');
  assert.equal(stations.status, 200);
  assert.equal(stations.body.length, 1);
  const changed = await admin
    .patch(`/api/admin/stations/${station._id}`)
    .set('X-CSRF-Token', adminCsrf)
    .send({ description: 'Updated through admin API' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.description, 'Updated through admin API');
  const chargers = await admin.get('/api/admin/chargers');
  assert.equal(chargers.status, 200);
  assert.equal(chargers.body[0].stationId.name, 'Test Station');
  const price = await admin
    .patch(`/api/admin/chargers/${charger._id}`)
    .set('X-CSRF-Token', adminCsrf)
    .send({ pricePerHourPaise: 15000 });
  assert.equal(price.status, 200);
  assert.equal(price.body.pricePerHourPaise, 15000);
  const users = await admin.get('/api/admin/users');
  assert.equal(users.status, 200);
  assert.equal(users.body.length, 3);
  assert.ok(users.body.every((u) => !('passwordHash' in u)));
  const bookings = await admin.get('/api/admin/bookings?status=completed');
  assert.equal(bookings.status, 200);
  assert.equal(bookings.body.length, 1);
  assert.equal(bookings.body[0].priceSnapshot.pricePerHourPaise, 12000);
  const payments = await admin.get('/api/admin/payments');
  assert.equal(payments.status, 200);
  assert.equal(payments.body.refunds.length, 1);
  const dashboard = await admin.get('/api/admin/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.customers, 2);
  assert.equal(dashboard.body.completed, 1);
  assert.equal(dashboard.body.grossPaise, 24000);
  assert.equal(dashboard.body.refundPaise, 12000);
  assert.equal(dashboard.body.netPaise, 12000);
  const report = await admin.get(
    `/api/admin/reports?from=${tomorrow.toISODate()}&to=${tomorrow.toISODate()}&stationId=${station._id}`,
  );
  assert.equal(report.status, 200);
  assert.equal(report.body.grossPaise, dashboard.body.grossPaise);
  const exported = await admin.get(
    `/api/admin/reports/export?from=${tomorrow.toISODate()}&to=${tomorrow.toISODate()}&status=completed`,
  );
  assert.equal(exported.status, 200);
  assert.equal(exported.text.split('\r\n').length, 2);
});

test('frontend assets are served, private files are inaccessible, and all declared routes are exercised', async () => {
  for (const path of [
    '/',
    '/assets/app.js',
    '/assets/admin.js',
    '/assets/style.css',
    '/vendor/leaflet/leaflet.js',
    '/vendor/bootstrap/css/bootstrap.min.css',
  ]) {
    const response = await request(app).get(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(
      response.headers['content-security-policy'].includes('https://tile.openstreetmap.org'),
    );
    assert.equal(response.text.includes('mongodb+srv://'), false);
  }
  for (const path of ['/.env', '/.git/config', '/src/config.js', '/api/unknown'])
    assert.equal((await request(app).get(path)).status, 404, path);
  const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const expected = [
    ...source.matchAll(/route\(\s*(app|a),\s*'(get|post|patch|delete)',\s*'([^']+)'/g),
  ].map(
    ([, router, method, path]) =>
      `${method.toUpperCase()} ${router === 'a' ? '/api/admin' : ''}${path}`,
  );
  for (const [, method, path] of source.matchAll(/app\.(get|post|patch|delete)\('([^']+)'/g))
    expected.push(`${method.toUpperCase()} ${path}`);
  for (const endpoint of expected) {
    assert.ok(coverage.has(endpoint), `Missing coverage: ${endpoint}`);
    assert.ok(
      [...coverage.get(endpoint)].some((status) => status >= 200 && status < 300),
      `No successful response: ${endpoint}`,
    );
  }
  console.log(`Verified successful responses for all ${expected.length} declared API endpoints.`);
});

test('authentication rate limiting blocks repeated incorrect logins', async () => {
  let response;
  for (let attempt = 0; attempt < 32; attempt++) {
    response = await post('/api/auth/login', {
      email: 'driver@example.com',
      password: 'incorrect',
    });
    if (response.status === 429) break;
  }
  assert.equal(response.status, 429);
});
