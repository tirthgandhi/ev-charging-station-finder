import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'dotenv';

// Scan only deliverable source. The private .env is read in memory, never printed.
const environment = parse(await readFile('.env', 'utf8').catch(() => ''));
const secrets = [
  environment.MONGODB_URI,
  environment.SESSION_SECRET,
  environment.ADMIN_EMAIL,
  environment.ADMIN_PASSWORD,
];
if (environment.MONGODB_URI) {
  const uri = new URL(environment.MONGODB_URI);
  secrets.push(uri.username, decodeURIComponent(uri.password), uri.hostname);
}
const needles = secrets.filter((value) => value && value.length >= 8);
const roots = [
  'src',
  'public',
  'scripts',
  'tests',
  'docs',
  'README.md',
  'SETUP.md',
  'compose.yaml',
  'package.json',
  'package-lock.json',
  '.env.example',
  '.gitignore',
  '.prettierrc.json',
  '.prettierignore',
];
let count = 0;
async function inspect(file) {
  let entries;
  try {
    entries = await readdir(file, { withFileTypes: true });
  } catch {
    /* regular file */
  }
  if (entries) {
    for (const entry of entries) await inspect(path.join(file, entry.name));
    return;
  }
  if (/\.(png|jpe?g|webp)$/i.test(file)) return;
  const content = await readFile(file, 'utf8');
  if (needles.some((secret) => content.includes(secret)))
    throw new Error(
      'A private configuration value was detected in deliverable source. Packaging blocked.',
    );
  count++;
}
try {
  for (const root of roots) await inspect(root);
  console.log(
    `PASS: ${count} deliverable text files checked; no configured private values detected.`,
  );
} catch {
  console.error(
    'Privacy verification failed. Do not package or publish until private values are removed.',
  );
  process.exitCode = 1;
}
