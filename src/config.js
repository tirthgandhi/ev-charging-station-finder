export function config(env = process.env) {
  const cfg = {
    production: env.NODE_ENV === 'production',
    port: Number(env.PORT || 3000),
    mongoUri: env.MONGODB_URI,
    secret: env.SESSION_SECRET,
    baseUrl: env.APP_BASE_URL || 'http://localhost:3000',
    holdMinutes: Number(env.BOOKING_HOLD_MINUTES || 5),
    horizonDays: Number(env.BOOKING_HORIZON_DAYS || 30),
    blockMinutes: Number(env.BOOKING_BLOCK_MINUTES || 30),
  };
  if (!cfg.mongoUri || !cfg.secret || cfg.secret.length < 32 || cfg.secret.startsWith('replace-'))
    throw new Error('Set MONGODB_URI and a random SESSION_SECRET of at least 32 characters.');
  if (![15, 30, 60].includes(cfg.blockMinutes) || cfg.holdMinutes <= 0 || cfg.horizonDays <= 0)
    throw new Error('Invalid booking configuration.');
  if (cfg.production && !cfg.baseUrl.startsWith('https://'))
    throw new Error('Production APP_BASE_URL must use HTTPS.');
  return cfg;
}
