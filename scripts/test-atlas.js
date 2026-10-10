import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';

// Never run destructive integration fixtures in the application's database.
const cfg = config();
const database = `voltway_test_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
const uri = new URL(cfg.mongoUri);
uri.pathname = `/${database}`;
const child = spawn(process.execPath, ['--test', 'tests/integration.test.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    TEST_MONGODB_URI: uri.toString(),
    TEST_DATABASE_NAME: database,
    TEST_DATABASE_MODE: 'atlas',
  },
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', () => {
  console.error('Could not launch the Atlas test runner.');
  process.exitCode = 1;
});
