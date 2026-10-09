import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { z, ZodError } from 'zod';
import { DateTime } from 'luxon';
import * as M from './models/index.js';
import * as V from './validation.js';
import { reserve, pay, cancel, period, busyQuery, expireHolds } from './services/booking.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const safeUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  status: u.status,
});
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const route = (router, method, url, ...handlers) =>
  router[method](url, ...handlers.map(asyncRoute));
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function createApp(cfg) {
  const app = express();
  if (cfg.production) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: cfg.production ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  const sessionStore = MongoStore.create({ mongoUrl: cfg.mongoUri, collectionName: 'sessions' });
  app.locals.sessionStore = sessionStore;
  app.use(
    session({
      name: 'ev.sid',
      secret: cfg.secret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: { httpOnly: true, sameSite: 'lax', secure: cfg.production, maxAge: 86400000 },
    }),
  );
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable' }),
  );
  app.get('/api/auth/csrf', (req, res) => {
    req.session.csrf ??= randomBytes(32).toString('hex');
    res.json({ token: req.session.csrf });
  });
  app.use('/api', (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (!req.session.csrf || req.get('X-CSRF-Token') !== req.session.csrf)
    )
      return res.status(403).json({ error: 'Session token expired. Refresh and try again.' });
    next();
  });
  app.use(
    '/api',
    asyncRoute(async (req, _res, next) => {
      if (req.session.userId) {
        const user = await M.User.findById(req.session.userId);
        if (user?.status === 'active') req.user = user;
      }
      next();
    }),
  );
  const auth = async (req, _res, next) => {
    if (!req.user) V.fail(401, 'Please sign in.');
    next();
  };
  const admin = async (req, _res, next) => {
    if (req.user?.role !== 'admin') V.fail(403, 'Admin access required.');
    next();
  };
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  app.use('/api/auth/login', authLimit);
  app.use('/api/auth/register', authLimit);
  const loginSession = async (req, user) => {
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = String(user._id);
    req.session.csrf = randomBytes(32).toString('hex');
    await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
    return { user: safeUser(user), csrf: req.session.csrf };
  };
  route(app, 'post', '/api/auth/register', async (req, res) => {
    const data = V.parse(V.register, req.body);
    const user = await M.User.create({
      ...data,
      passwordHash: await bcrypt.hash(data.password, 12),
    });
    res.status(201).json(await loginSession(req, user));
  });
  route(app, 'post', '/api/auth/login', async (req, res) => {
    const data = z
      .object({ email: z.email().transform((v) => v.toLowerCase()), password: z.string().max(128) })
      .parse(req.body);
    const user = await M.User.findOne({ email: data.email }).select('+passwordHash');
    if (
      !user ||
      user.status !== 'active' ||
      !(await bcrypt.compare(data.password, user.passwordHash))
    )
      V.fail(401, 'Invalid email or password.');
    res.json(await loginSession(req, user));
  });
  route(app, 'post', '/api/auth/logout', async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
    res.clearCookie('ev.sid');
    res.json({ ok: true });
  });
  route(app, 'get', '/api/auth/me', async (req, res) =>
    res.json({
      user: req.user ? safeUser(req.user) : null,
      config: {
        blockMinutes: cfg.blockMinutes,
        horizonDays: cfg.horizonDays,
        holdMinutes: cfg.holdMinutes,
      },
    }),
  );
  route(app, 'patch', '/api/users/me', auth, async (req, res) => {
    Object.assign(req.user, V.profile.parse(req.body));
    await req.user.save();
    res.json(safeUser(req.user));
  });
  route(app, 'get', '/api/vehicles', auth, async (req, res) =>
    res.json(await M.Vehicle.find({ userId: req.user._id }).sort({ createdAt: -1 })),
  );
  route(app, 'post', '/api/vehicles', auth, async (req, res) =>
    res
      .status(201)
      .json(await M.Vehicle.create({ ...V.vehicle.parse(req.body), userId: req.user._id })),
  );
  route(app, 'patch', '/api/vehicles/:id', auth, async (req, res) => {
    const item = await M.Vehicle.findOneAndUpdate(
      { _id: V.id.parse(req.params.id), userId: req.user._id },
      { $set: V.vehicle.partial().parse(req.body) },
      { new: true, runValidators: true },
    );
    if (!item) V.fail(404, 'Vehicle not found.');
    res.json(item);
  });
  route(app, 'delete', '/api/vehicles/:id', auth, async (req, res) => {
    const item = await M.Vehicle.findOneAndUpdate(
      { _id: V.id.parse(req.params.id), userId: req.user._id },
      { $set: { isActive: false } },
      { new: true },
    );
    if (!item) V.fail(404, 'Vehicle not found.');
    res.json(item);
  });
  route(app, 'get', '/api/stations', async (req, res) => {
    const q = z
      .object({
        q: z.string().max(100).optional(),
        connector: V.connector.optional(),
        minPower: z.coerce.number().min(0).optional(),
        startAt: z.iso.datetime({ offset: true }).optional(),
        endAt: z.iso.datetime({ offset: true }).optional(),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
      })
      .parse(req.query);
    if (Boolean(q.startAt) !== Boolean(q.endAt)) V.fail(400, 'Provide both start and end.');
    const query = { status: 'active' };
    if (q.q) {
      const regex = new RegExp(escapeRegex(q.q), 'i');
      query.$or = ['name', 'city', 'address'].map((k) => ({ [k]: regex }));
    }
    const stations = await M.Station.find(query).lean();
    const result = [];
    for (const station of stations) {
      let chargers = await M.Charger.find({
        stationId: station._id,
        operationalStatus: 'active',
        ...(q.connector ? { connectorType: q.connector } : {}),
        ...(q.minPower ? { powerKw: { $gte: q.minPower } } : {}),
      }).lean();
      if (q.startAt) {
        try {
          const p = period(q.startAt, q.endAt, station, cfg);
          const busy = await M.Block.distinct('chargerId', {
            chargerId: { $in: chargers.map((c) => c._id) },
            blockStartAt: { $in: p.blocks },
            ...busyQuery(),
          });
          chargers = chargers.filter((c) => !busy.some((id) => String(id) === String(c._id)));
        } catch (e) {
          if (e.status === 400) continue;
          throw e;
        }
      }
      if (!chargers.length) continue;
      station.chargers = chargers;
      if (q.lat !== undefined && q.lng !== undefined) {
        const [lng, lat] = station.location.coordinates;
        const rad = (v) => (v * Math.PI) / 180;
        const a =
          Math.sin(rad(lat - q.lat) / 2) ** 2 +
          Math.cos(rad(q.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lng - q.lng) / 2) ** 2;
        station.distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
      result.push(station);
    }
    if (q.lat !== undefined) result.sort((a, b) => a.distanceKm - b.distanceKm);
    res.json(result);
  });
  route(app, 'get', '/api/stations/:id', async (req, res) => {
    const station = await M.Station.findOne({
      _id: V.id.parse(req.params.id),
      status: 'active',
    }).lean();
    if (!station) V.fail(404, 'Station not found.');
    res.json({ ...station, chargers: await M.Charger.find({ stationId: station._id }) });
  });
  route(app, 'get', '/api/stations/:id/reviews', async (req, res) =>
    res.json(
      await M.Review.find({ stationId: V.id.parse(req.params.id) })
        .populate('userId', 'name')
        .sort({ createdAt: -1 })
        .limit(100),
    ),
  );
  route(app, 'get', '/api/chargers/:id/availability', async (req, res) => {
    const charger = await M.Charger.findById(V.id.parse(req.params.id));
    if (!charger) V.fail(404, 'Charger not found.');
    const station = await M.Station.findById(charger.stationId);
    const date = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(req.query.date);
    let start = DateTime.fromISO(`${date}T${station.openingHours.open}`, {
      zone: station.timeZone,
    });
    const close = DateTime.fromISO(`${date}T${station.openingHours.close}`, {
      zone: station.timeZone,
    });
    if (!start.isValid || !close.isValid) V.fail(400, 'Invalid date.');
    start = start.plus({
      minutes: (cfg.blockMinutes - (start.minute % cfg.blockMinutes)) % cfg.blockMinutes,
    });
    const busy = await M.Block.find({
      chargerId: charger._id,
      blockStartAt: { $gte: start.toJSDate(), $lt: close.toJSDate() },
      ...busyQuery(),
    });
    const slots = [];
    while (start.plus({ minutes: cfg.blockMinutes }) <= close) {
      const end = start.plus({ minutes: cfg.blockMinutes });
      let available =
        station.status === 'active' &&
        charger.operationalStatus === 'active' &&
        !busy.some((b) => +b.blockStartAt === +start);
      try {
        period(start.toISO(), end.toISO(), station, cfg);
      } catch {
        available = false;
      }
      slots.push({
        startAt: start.toUTC().toISO(),
        endAt: end.toUTC().toISO(),
        label: start.toFormat('HH:mm'),
        available,
      });
      start = end;
    }
    res.json({ timeZone: station.timeZone, blockMinutes: cfg.blockMinutes, slots });
  });
  route(app, 'post', '/api/bookings', auth, async (req, res) =>
    res.status(201).json(await reserve(req.user._id, V.reservation.parse(req.body), cfg)),
  );
  route(app, 'get', '/api/bookings', auth, async (req, res) => {
    await expireHolds();
    res.json(await M.Booking.find({ userId: req.user._id }).sort({ createdAt: -1 }));
  });
  route(app, 'get', '/api/bookings/:id', auth, async (req, res) => {
    await expireHolds();
    const booking = await M.Booking.findOne({
      _id: V.id.parse(req.params.id),
      userId: req.user._id,
    }).lean();
    if (!booking) V.fail(404, 'Booking not found.');
    res.json({
      ...booking,
      payments: await M.Payment.find({ bookingId: booking._id }),
      refunds: await M.Refund.find({ bookingId: booking._id }),
      review: await M.Review.findOne({ bookingId: booking._id }),
    });
  });
  route(app, 'post', '/api/bookings/:id/payments/simulate', auth, async (req, res) => {
    const data = z
      .object({
        outcome: z.enum(['success', 'failed']),
        idempotencyKey: z.string().min(8).max(100),
      })
      .parse(req.body);
    res.json(await pay(req.user._id, V.id.parse(req.params.id), data.outcome, data.idempotencyKey));
  });
  route(app, 'post', '/api/bookings/:id/cancel', auth, async (req, res) =>
    res.json(
      await cancel(
        req.user._id,
        V.id.parse(req.params.id),
        z
          .string()
          .max(500)
          .parse(req.body.reason || 'Customer cancellation'),
      ),
    ),
  );
  route(app, 'post', '/api/bookings/:id/review', auth, async (req, res) => {
    const booking = await M.Booking.findOne({
      _id: V.id.parse(req.params.id),
      userId: req.user._id,
      status: 'completed',
    });
    if (!booking) V.fail(403, 'Only your completed bookings can be reviewed.');
    const data = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);
    res.status(201).json(
      await M.Review.create({
        ...data,
        bookingId: booking._id,
        userId: req.user._id,
        stationId: booking.stationId,
      }),
    );
  });
  route(app, 'get', '/api/notifications', auth, async (req, res) =>
    res.json(
      await M.Notification.find({ recipientId: req.user._id }).sort({ createdAt: -1 }).limit(100),
    ),
  );
  route(app, 'patch', '/api/notifications/:id/read', auth, async (req, res) => {
    const item = await M.Notification.findOneAndUpdate(
      { _id: V.id.parse(req.params.id), recipientId: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true },
    );
    if (!item) V.fail(404, 'Notification not found.');
    res.json(item);
  });
  const a = express.Router();
  a.use(asyncRoute(auth), asyncRoute(admin));
  app.use('/api/admin', a);
  route(a, 'get', '/stations', async (_req, res) =>
    res.json(await M.Station.find().sort({ name: 1 })),
  );
  route(a, 'get', '/chargers', async (_req, res) =>
    res.json(await M.Charger.find().populate('stationId', 'name')),
  );
  route(a, 'post', '/stations', async (req, res) =>
    res.status(201).json(await M.Station.create(V.station.parse(req.body))),
  );
  route(a, 'patch', '/stations/:id', async (req, res) => {
    const item = await M.Station.findByIdAndUpdate(
      V.id.parse(req.params.id),
      { $set: V.station.partial().parse(req.body) },
      { new: true, runValidators: true },
    );
    if (!item) V.fail(404, 'Station not found.');
    res.json(item);
  });
  route(a, 'post', '/stations/:id/chargers', async (req, res) => {
    if (!(await M.Station.exists({ _id: V.id.parse(req.params.id) })))
      V.fail(404, 'Station not found.');
    res
      .status(201)
      .json(await M.Charger.create({ ...V.charger.parse(req.body), stationId: req.params.id }));
  });
  route(a, 'patch', '/chargers/:id', async (req, res) => {
    const item = await M.Charger.findByIdAndUpdate(
      V.id.parse(req.params.id),
      { $set: V.charger.partial().parse(req.body) },
      { new: true, runValidators: true },
    );
    if (!item) V.fail(404, 'Charger not found.');
    res.json(item);
  });
  route(a, 'get', '/users', async (_req, res) =>
    res.json(await M.User.find().sort({ createdAt: -1 })),
  );
  route(a, 'patch', '/users/:id/status', async (req, res) => {
    const status = z.enum(['active', 'inactive']).parse(req.body.status);
    const user = await M.User.findOneAndUpdate(
      { _id: V.id.parse(req.params.id), role: 'customer' },
      { $set: { status } },
      { new: true },
    );
    if (!user) V.fail(404, 'Customer not found.');
    res.json(safeUser(user));
  });
  function reportFilter(query) {
    const data = z
      .object({
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
        stationId: V.id.optional(),
        status: z
          .enum([
            'pending_payment',
            'confirmed',
            'in_progress',
            'completed',
            'cancelled',
            'expired',
          ])
          .optional(),
      })
      .parse(query);
    const filter = {};
    if (data.from || data.to) {
      filter.startAt = {};
      if (data.from) filter.startAt.$gte = new Date(data.from);
      if (data.to) filter.startAt.$lt = new Date(+new Date(data.to) + 86400000);
      if (data.from && data.to && data.from > data.to)
        V.fail(400, 'Start date must precede end date.');
    }
    if (data.stationId) filter.stationId = data.stationId;
    if (data.status) filter.status = data.status;
    return filter;
  }
  route(a, 'get', '/bookings', async (req, res) => {
    await expireHolds();
    res.json(await M.Booking.find(reportFilter(req.query)).sort({ createdAt: -1 }));
  });
  route(a, 'patch', '/bookings/:id/status', async (req, res) => {
    const status = z.enum(['in_progress', 'completed']).parse(req.body.status);
    const item = await M.Booking.findOneAndUpdate(
      {
        _id: V.id.parse(req.params.id),
        status: status === 'in_progress' ? 'confirmed' : 'in_progress',
      },
      { $set: { status } },
      { new: true },
    );
    if (!item) V.fail(409, 'This booking transition is not permitted.');
    res.json(item);
  });
  route(a, 'get', '/payments', async (_req, res) =>
    res.json({
      payments: await M.Payment.find().sort({ createdAt: -1 }),
      refunds: await M.Refund.find().sort({ createdAt: -1 }),
    }),
  );
  async function reports(query) {
    await expireHolds();
    const filter = reportFilter(query);
    const bookings = await M.Booking.find(filter).lean();
    const ids = bookings.map((b) => b._id);
    const payments = await M.Payment.find({ bookingId: { $in: ids } }).lean(),
      refunds = await M.Refund.find({ bookingId: { $in: ids } }).lean();
    const gross = payments
        .filter((p) => p.status === 'success')
        .reduce((n, p) => n + p.amountPaise, 0),
      refunded = refunds.reduce((n, r) => n + r.amountPaise, 0);
    const grouped = (key) =>
      bookings.reduce((out, b) => {
        const k = key(b);
        out[k] = (out[k] || 0) + 1;
        return out;
      }, {});
    return {
      bookings,
      payments,
      refunds,
      grossPaise: gross,
      refundPaise: refunded,
      netPaise: gross - refunded,
      byStatus: grouped((b) => b.status),
      byDate: grouped((b) => b.startAt.toISOString().slice(0, 10)),
      byStation: grouped((b) => b.stationSnapshot.name),
      reservedHours: bookings
        .filter((b) => ['confirmed', 'in_progress', 'completed'].includes(b.status))
        .reduce((n, b) => n + (b.endAt - b.startAt) / 3600000, 0),
      registrations: await M.User.countDocuments({
        role: 'customer',
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { $gte: new Date(query.from) } : {}),
                ...(query.to ? { $lt: new Date(+new Date(query.to) + 86400000) } : {}),
              },
            }
          : {}),
      }),
    };
  }
  route(a, 'get', '/reports', async (req, res) => res.json(await reports(req.query)));
  route(a, 'get', '/reports/export', async (req, res) => {
    const data = await reports(req.query);
    const cell = (v) =>
      '"' +
      String(v ?? '')
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      ['Reference', 'Station', 'Start UTC', 'End UTC', 'Status', 'Amount INR', 'Payment mode'],
      ...data.bookings.map((b) => [
        b.bookingReference,
        b.stationSnapshot.name,
        b.startAt.toISOString(),
        b.endAt.toISOString(),
        b.status,
        (b.amountPaise / 100).toFixed(2),
        'simulated',
      ]),
    ];
    res
      .set('Content-Disposition', 'attachment; filename="ev-bookings.csv"')
      .type('text/csv')
      .send(rows.map((r) => r.map(cell).join(',')).join('\r\n'));
  });
  route(a, 'get', '/dashboard', async (_req, res) => {
    const data = await reports({});
    const today = DateTime.now().setZone('Asia/Kolkata').startOf('day').toJSDate();
    res.json({
      customers: await M.User.countDocuments({ role: 'customer' }),
      stations: await M.Station.countDocuments({ status: 'active' }),
      chargers: await M.Charger.countDocuments({ operationalStatus: 'active' }),
      todayBookings: data.bookings.filter(
        (b) => b.startAt >= today && b.startAt < new Date(+today + 86400000),
      ).length,
      upcoming: data.bookings.filter((b) => b.status === 'confirmed' && b.startAt > new Date())
        .length,
      completed: data.byStatus.completed || 0,
      cancelled: data.byStatus.cancelled || 0,
      grossPaise: data.grossPaise,
      refundPaise: data.refundPaise,
      netPaise: data.netPaise,
      byDate: data.byDate,
    });
  });
  app.use('/vendor/bootstrap', express.static(path.join(root, 'node_modules/bootstrap/dist')));
  app.use('/vendor/leaflet', express.static(path.join(root, 'node_modules/leaflet/dist')));
  app.use(express.static(path.join(root, 'public')));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res
        .status(400)
        .json({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (error.code === 11000) return res.status(409).json({ error: 'This record already exists.' });
    if (error instanceof mongoose.Error.CastError)
      return res.status(400).json({ error: 'Invalid record identifier.' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Request failed:', error.name, error.code || '');
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  });
  return app;
}
