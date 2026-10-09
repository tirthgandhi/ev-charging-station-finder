// Isolated demonstration server. Its temporary database is deleted on exit.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { expireHolds } from '../src/services/booking.js';
const repl = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  binary: { version: '7.0.14' },
});
process.env.MONGODB_URI = repl.getUri();
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
process.env.ADMIN_EMAIL = 'admin@voltway.demo';
process.env.ADMIN_PASSWORD = 'Voltway-Demo-2026';
await import('./seed.js');
await mongoose.connect(process.env.MONGODB_URI);
const app = createApp({
  mongoUri: process.env.MONGODB_URI,
  secret: process.env.SESSION_SECRET,
  holdMinutes: 5,
  horizonDays: 30,
  blockMinutes: 30,
});
const server = app.listen(3000, '127.0.0.1', () =>
  console.log(
    'Temporary demo: http://localhost:3000 — admin@voltway.demo / Voltway-Demo-2026 (demo only)',
  ),
);
const timer = setInterval(() => expireHolds().catch(() => {}), 30000);
timer.unref();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    clearInterval(timer);
    server.close();
    await app.locals.sessionStore.close();
    await mongoose.disconnect();
    await repl.stop();
    process.exit(0);
  });
