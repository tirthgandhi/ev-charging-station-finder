const recordId = '[a-f0-9]{24}';
export const pageRoutes = [
  { name: 'home', pattern: /^#\/$/ },
  ...['login', 'register', 'bookings', 'vehicles', 'profile', 'notifications'].map((name) => ({
    name,
    pattern: new RegExp(`^#/${name}$`),
    protected: !['login', 'register'].includes(name),
  })),
  { name: 'station', pattern: new RegExp(`^#/station/(${recordId})$`, 'i') },
  { name: 'booking', pattern: new RegExp(`^#/booking/(${recordId})$`, 'i'), protected: true },
  {
    name: 'admin',
    pattern: new RegExp(
      `^#/admin(?:/(dashboard|stations|chargers|bookings|users|payments|reports)(?:/(${recordId}))?)?$`,
      'i',
    ),
    protected: true,
    admin: true,
  },
];
export function resolveRoute(hash) {
  const normalized = !hash || hash === '#' || hash === '#/' ? '#/' : hash.replace(/\/$/, '');
  for (const route of pageRoutes) {
    const match = normalized.match(route.pattern);
    if (match) {
      if (route.name === 'admin' && match[2] && !['stations', 'chargers'].includes(match[1]))
        return null;
      return { ...route, params: match.slice(1) };
    }
  }
  return null;
}
