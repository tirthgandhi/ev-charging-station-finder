import mongoose from 'mongoose';
import { config } from './config.js';
import { initializeModels } from './models/index.js';
import { createApp } from './app.js';
import { expireHolds } from './services/booking.js';
const cfg = config();
await mongoose.connect(cfg.mongoUri);
await initializeModels();
const hello = await mongoose.connection.db.admin().command({ hello: 1 });
if (!hello.setName && hello.msg !== 'isdbgrid')
  throw new Error('MongoDB must be a replica set or Atlas cluster for transactional reservations.');
const timer = setInterval(
  () => expireHolds().catch((e) => console.error('Hold cleanup failed:', e.name)),
  30000,
);
timer.unref();
const app = createApp(cfg);
const server = app.listen(cfg.port, () => console.log(`EV charging application: ${cfg.baseUrl}`));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(async () => {
      await app.locals.sessionStore.close();
      await mongoose.disconnect();
      process.exit(0);
    });
  });
