import {
  api,
  escape as e,
  money,
  dateTime,
  toast,
  bindForm,
  field,
  select,
  connectors,
  badge,
} from './api.js';
const stats = (items) =>
  `<div class="stats">${items.map(([label, value, meta = '']) => `<div class="stat"><div class="label">${label}</div><div class="value">${e(value)}</div><div class="meta">${meta}</div></div>`).join('')}</div>`;
const table = (headers, rows) =>
  `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}"><div class="empty">No records to show.</div></td></tr>`}</tbody></table></div>`;
const charts = (groups) =>
  Object.entries(groups)
    .map(
      ([name, value]) =>
        `<div class="chart-row"><span class="chart-label">${e(name)}</span><div class="chart-track"><div class="chart-bar" style="width:${(100 * value) / Math.max(1, ...Object.values(groups))}%"></div></div><span>${value}</span></div>`,
    )
    .join('') || '<p>No activity for this period.</p>';
export async function renderAdmin(app, page, action, refresh) {
  const tabs = ['dashboard', 'stations', 'chargers', 'bookings', 'users', 'payments', 'reports'];
  app.innerHTML = `<div class="page-heading"><div><div class="eyebrow">ADMIN WORKSPACE</div><h1>Keep the network moving.</h1><p>Stations, reservations and the people behind every journey.</p></div><span class="demo-pill">SIMULATED PAYMENTS ONLY</span></div><nav class="admin-tabs" aria-label="Admin navigation">${tabs.map((t) => `<a href="#/admin/${t}" class="${t === page ? 'active' : ''}">${t[0].toUpperCase() + t.slice(1)}</a>`).join('')}<a href="#/notifications">Notifications</a></nav><div id="admin-content"><div class="loading">Loading workspace…</div></div>`;
  const content = document.querySelector('#admin-content');
  if (page === 'dashboard') {
    const d = await api('/api/admin/dashboard');
    content.innerHTML =
      stats([
        ['Customers', d.customers, 'Registered drivers'],
        ['Active stations', d.stations, 'Across the network'],
        ['Active chargers', d.chargers, 'Operational charging units'],
        ['Today’s bookings', d.todayBookings, 'Calendar day · Asia/Kolkata'],
        ['Upcoming sessions', d.upcoming],
        ['Completed sessions', d.completed],
        ['Cancelled sessions', d.cancelled],
        ['Net simulated payments', money(d.netPaise), 'No real money collected'],
      ]) +
      `<div class="two-column"><section class="panel"><h2>Reservations by date</h2>${charts(d.byDate)}</section><section class="panel"><h2>Simulated payment overview</h2><div class="summary-row"><span>Gross simulated payments</span><strong>${money(d.grossPaise)}</strong></div><div class="summary-row"><span>Simulated refunds</span><strong>${money(d.refundPaise)}</strong></div><div class="summary-row total"><span>Net</span><strong>${money(d.netPaise)}</strong></div><p class="small-text mt-3">These figures represent the dummy payment demonstration.</p></section></div>`;
  } else if (page === 'stations') {
    const stations = await api('/api/admin/stations');
    const current = stations.find((s) => s._id === action);
    content.innerHTML = `<section class="panel"><h2>Station directory</h2>${table(
      ['Station', 'City', 'Hours', 'Status', 'Manage'],
      stations.map((s) => [
        e(s.name),
        e(s.city),
        e(s.openingHours.open + ' – ' + s.openingHours.close),
        badge(s.status),
        `<a class="button secondary" href="#/admin/stations/${s._id}">Edit</a>`,
      ]),
    )}</section><section class="panel"><h2>${current ? 'Edit station' : 'Add a station'}</h2><form id="station-form"><div class="form-grid">${field('Station name', 'name', 'text', current?.name, 'required')}${field('City', 'city', 'text', current?.city, 'required')}${field('Street address', 'address', 'text', current?.address, 'required')}${field('State', 'state', 'text', current?.state || 'Gujarat', 'required')}${field('Postal code', 'postalCode', 'text', current?.postalCode, 'required')}${field('Contact phone', 'contactPhone', 'tel', current?.contactPhone, 'required')}${field('Latitude', 'lat', 'number', current?.location.coordinates[1] ?? 22.3072, 'required min="-90" max="90" step="any"')}${field('Longitude', 'lng', 'number', current?.location.coordinates[0] ?? 73.1812, 'required min="-180" max="180" step="any"')}${field('Opening time', 'open', 'time', current?.openingHours.open || '06:00', 'required step="1800"')}${field('Closing time', 'close', 'time', current?.openingHours.close || '23:30', 'required step="1800"')}${field('IANA time zone', 'timeZone', 'text', current?.timeZone || 'Asia/Kolkata', 'required')}${select('Status', 'status', ['active', 'inactive'], current?.status)}<div class="field wide"><label for="description">Description</label><textarea id="description" name="description" rows="3" maxlength="2000">${e(current?.description || '')}</textarea></div></div><button class="button" type="submit">Save station →</button> <a class="button ghost" href="#/admin/stations">New station</a></form></section>`;
    bindForm('station-form', async (data) => {
      const { lat, lng, open, close, ...rest } = data;
      await api(
        '/api/admin/stations' + (current ? `/${current._id}` : ''),
        current ? 'PATCH' : 'POST',
        {
          ...rest,
          location: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          openingHours: { open, close },
        },
      );
      toast('Station saved.');
      await refresh();
    });
  } else if (page === 'chargers') {
    const [chargers, stations] = await Promise.all([
      api('/api/admin/chargers'),
      api('/api/admin/stations'),
    ]);
    const current = chargers.find((c) => c._id === action);
    content.innerHTML = `<section class="panel"><h2>Physical chargers</h2>${table(
      ['Charger', 'Station', 'Connector', 'Power', 'Hourly rate', 'Status', 'Manage'],
      chargers.map((c) => [
        e(c.chargerCode),
        e(c.stationId?.name),
        e(c.connectorType),
        `${c.powerKw} kW`,
        money(c.pricePerHourPaise),
        badge(c.operationalStatus),
        `<a class="button secondary" href="#/admin/chargers/${c._id}">Edit</a>`,
      ]),
    )}</section><section class="panel"><h2>${current ? 'Edit charger' : 'Add a charger'}</h2><form id="charger-form"><div class="form-grid">${select(
      'Station',
      'stationId',
      stations.map((s) => [s._id, s.name]),
      current?.stationId?._id,
    )}${field('Charger code', 'chargerCode', 'text', current?.chargerCode, 'required')}${select('Connector type', 'connectorType', connectors, current?.connectorType)}${field('Power (kW)', 'powerKw', 'number', current?.powerKw || 60, 'required min="0.1" max="2000" step="0.1"')}${field('Price per hour (₹)', 'price', 'number', (current?.pricePerHourPaise || 18000) / 100, 'required min="0.01" step="0.01"')}${select('Operational status', 'operationalStatus', ['active', 'maintenance', 'inactive'], current?.operationalStatus)}</div><button class="button" type="submit">Save charger →</button> <a class="button ghost" href="#/admin/chargers">New charger</a></form></section>`;
    if (current) document.querySelector('#stationId').disabled = true;
    bindForm('charger-form', async (data) => {
      const { stationId, price, ...rest } = data;
      await api(
        current
          ? `/api/admin/chargers/${current._id}`
          : `/api/admin/stations/${stationId}/chargers`,
        current ? 'PATCH' : 'POST',
        {
          ...rest,
          powerKw: Number(rest.powerKw),
          pricePerHourPaise: Math.round(Number(price) * 100),
        },
      );
      toast('Charger saved.');
      await refresh();
    });
  } else if (page === 'users') {
    const users = await api('/api/admin/users');
    content.innerHTML = `<section class="panel"><h2>Network members</h2>${table(
      ['Name', 'Email', 'Phone', 'Role', 'Status', 'Action'],
      users.map((u) => [
        e(u.name),
        e(u.email),
        e(u.phone),
        e(u.role),
        badge(u.status),
        u.role === 'customer'
          ? `<button class="button secondary user-status" data-id="${u._id}" data-status="${u.status === 'active' ? 'inactive' : 'active'}">${u.status === 'active' ? 'Deactivate' : 'Activate'}</button>`
          : 'Controlled setup',
      ]),
    )}</section>`;
    document.querySelectorAll('.user-status').forEach(
      (btn) =>
        (btn.onclick = async () => {
          try {
            await api(`/api/admin/users/${btn.dataset.id}/status`, 'PATCH', {
              status: btn.dataset.status,
            });
            toast('Customer status updated.');
            await refresh();
          } catch (err) {
            toast(err.message, true);
          }
        }),
    );
  } else if (page === 'payments') {
    const d = await api('/api/admin/payments');
    content.innerHTML = `<div class="notice">All payments and refunds on this page are simulated. No real funds are moved.</div><section class="panel"><h2>Simulated payments</h2>${table(
      ['Reference', 'Booking', 'Amount', 'Status', 'Processed'],
      d.payments.map((p) => [
        e(p.transactionReference),
        e(p.bookingId),
        money(p.amountPaise),
        badge(p.status),
        e(dateTime(p.processedAt)),
      ]),
    )}</section><section class="panel"><h2>Simulated refunds</h2>${table(
      ['Reference', 'Booking', 'Amount', 'Status'],
      d.refunds.map((r) => [
        e(r.refundReference),
        e(r.bookingId),
        money(r.amountPaise),
        badge(r.status),
      ]),
    )}</section>`;
  } else if (page === 'bookings' || page === 'reports') {
    const stations = await api('/api/admin/stations');
    content.innerHTML = `<form id="report-filter" class="panel"><div class="form-grid">${field('From date (UTC)', 'from', 'date')}${field('Through date (UTC)', 'to', 'date')}${select('Station', 'stationId', [['', 'All stations'], ...stations.map((s) => [s._id, s.name])])}${select('Booking status', 'status', [['', 'All statuses'], ...['pending_payment', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'].map((s) => [s, s.replaceAll('_', ' ')])])}</div><button class="button" type="submit">Apply filters →</button> <a class="button secondary" id="csv-export" href="/api/admin/reports/export" download>Export CSV ↓</a></form><div id="report-result"></div>`;
    const load = async (data = {}) => {
      const params = new URLSearchParams(Object.entries(data).filter(([, v]) => v));
      document.querySelector('#csv-export').href = '/api/admin/reports/export?' + params;
      const result = document.querySelector('#report-result');
      const response = await api(
        `/api/admin/${page === 'reports' ? 'reports' : 'bookings'}?${params}`,
      );
      const bookings = page === 'reports' ? response.bookings : response;
      result.innerHTML =
        (page === 'reports'
          ? stats([
              ['Gross simulated', money(response.grossPaise)],
              ['Simulated refunds', money(response.refundPaise)],
              ['Net simulated', money(response.netPaise)],
              ['Reserved hours', response.reservedHours, 'Booked time; not measured energy'],
              ['Customer registrations', response.registrations, 'Within selected date period'],
            ]) +
            `<div class="two-column"><section class="panel"><h2>By station</h2>${charts(response.byStation)}</section><section class="panel"><h2>By status</h2>${charts(response.byStatus)}</section></div><section class="panel"><h2>By date</h2>${charts(response.byDate)}</section>`
          : '') +
        `<section class="panel"><h2>Reservations</h2>${table(
          ['Reference', 'Station / Vehicle', 'Starts', 'Status', 'Amount', 'Action'],
          bookings.map((b) => [
            e(b.bookingReference),
            `${e(b.stationSnapshot.name)}<br><small class="muted">${e(b.vehicleSnapshot.registrationNumber)}</small>`,
            e(dateTime(b.startAt, b.stationSnapshot.timeZone)),
            badge(b.status),
            money(b.amountPaise),
            ['confirmed', 'in_progress'].includes(b.status)
              ? `<button class="button secondary transition" data-id="${b._id}" data-status="${b.status === 'confirmed' ? 'in_progress' : 'completed'}">${b.status === 'confirmed' ? 'Start session' : 'Complete session'}</button>`
              : '—',
          ]),
        )}</section>` +
        (page === 'reports'
          ? `<section class="panel"><h2>Simulated payment and refund history</h2>${table(['Type', 'Reference', 'Amount', 'Status'], [...response.payments.map((p) => ['Simulated payment', e(p.transactionReference), money(p.amountPaise), badge(p.status)]), ...response.refunds.map((r) => ['Simulated refund', e(r.refundReference), money(r.amountPaise), badge(r.status)])])}</section>`
          : '');
      document.querySelectorAll('.transition').forEach(
        (btn) =>
          (btn.onclick = async () => {
            btn.disabled = true;
            try {
              await api(`/api/admin/bookings/${btn.dataset.id}/status`, 'PATCH', {
                status: btn.dataset.status,
              });
              toast('Session status updated.');
              await load(data);
            } catch (err) {
              toast(err.message, true);
              btn.disabled = false;
            }
          }),
      );
    };
    bindForm('report-filter', load);
    await load();
  } else content.innerHTML = '<div class="empty">Admin page not found.</div>';
}
