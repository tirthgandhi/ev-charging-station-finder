import mongoose from 'mongoose';
import { config } from '../src/config.js';

try {
  const cfg = config();
  await mongoose.connect(cfg.mongoUri, { serverSelectionTimeoutMS: 15000 });
  await mongoose.connection.db.command({ ping: 1 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Transactions unavailable');
  console.log('PASS: authenticated database connection, ping and transaction-capable cluster.');
} catch (error) {
  console.error(
    `Database verification failed (${error.name}; code ${error.code || 'unavailable'}).`,
  );
  console.error(
    'Check the private .env, Atlas database-user permissions, network access and DNS. Credentials are never printed.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
