import {
  api,
  escape as e,
  money,
  dateTime,
  dateInZone,
  toast,
  bindForm,
  field,
  select,
  connectors,
  badge,
} from './api.js';
import { renderAdmin } from './admin.js';
const app = document.querySelector('#app');
let user = null,
  configuration = {},
  map = null,
  countdown = null,
  renderVersion = 0;
const heading = (title, description, action = '') =>
  `<div class="page-heading"><div><div class="eyebrow">A better way to charge</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
const button = (text, url, style = '') => `<a class="button ${style}" href="${url}">${text}</a>`;
function navigation() {
  const page = location.hash.split('/')[1] || '';
  const links = [
    ['', '⌖', 'Find a station'],
    ['bookings', '▤', 'My bookings'],
    ['vehicles', '▱', 'My vehicles'],
    ['notifications', '♧', 'Notifications'],
    ['profile', '⊙', 'My profile'],
    ...(user?.role === 'admin' ? [['admin', '▦', 'Admin workspace']] : []),
  ];
  document.querySelector('#navigation').innerHTML = links
    .map(
      ([href, icon, label]) =>
        `<a class="nav-link ${page === href ? 'active' : ''}" href="#/${href}"><span class="nav-symbol">${icon}</span>${label}</a>`,
    )
    .join('');
  document.querySelector('#account').innerHTML = user
    ? `<div class="account-row"><div class="avatar">${e(user.name[0].toUpperCase())}</div><div><strong>${e(user.name)}</strong><small>${e(user.role)} account</small></div><button class="signout" id="logout" aria-label="Sign out">↗</button></div>`
    : `${button('Sign in →', '#/login', 'secondary')} <a class="small-text muted" href="#/register">Join us</a>`;
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', 'POST', {});
      user = null;
      location.hash = '#/';
      await render();
    } catch (err) {
      toast(err.message, true);
    }
  });
  document.querySelector('#page-name').textContent =
    links.find((l) => l[0] === page)?.[2] ||
    {
      station: 'Station details',
      booking: 'Your reservation',
      login: 'Welcome back',
      register: 'Create an account',
    }[page] ||
    'Explore';
}
function mountMap(stations) {
  if (!window.L) return;
  const el = document.querySelector('#map');
  if (!el) return;
  if (map) {
    map.remove();
    map = null;
  }
  map = L.map(el, { scrollWheelZoom: false }).setView([22.5, 72.9], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const bounds = [];
  for (const s of stations) {
    const [lng, lat] = s.location.coordinates;
    bounds.push([lat, lng]);
    const content = document.createElement('div');
    const link = document.createElement('a');
    link.href = `#/station/${s._id}`;
    link.textContent = s.name + ' →';
    content.append(link);
    L.marker([lat, lng], { icon: L.divIcon({ className: 'map-pin', iconSize: [18, 18] }) })
      .addTo(map)
      .bindPopup(content);
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
}
function stationCard(s, i) {
  return `<article class="station-card"><a href="#/station/${s._id}"><div class="station-scene scene-${i % 3}"><span class="status-badge">${s.chargers.length} active chargers</span><span class="sample-tag">ILLUSTRATION</span><span class="scene-label">RECHARGE.<br>RECONNECT.</span></div></a><div class="station-content"><h3><a href="#/station/${s._id}">${e(s.name)}</a></h3><p class="station-address">⌖ ${e(s.address)}, ${e(s.city)}${s.distanceKm !== undefined ? ` · ${s.distanceKm.toFixed(1)} km` : ''}</p><div class="station-specs"><span class="spec">ϟ Up to ${Math.max(...s.chargers.map((c) => c.powerKw))} kW</span><span class="spec">${e([...new Set(s.chargers.map((c) => c.connectorType))].join(' · '))}</span></div><div class="card-bottom"><div class="price">${money(Math.min(...s.chargers.map((c) => c.pricePerHourPaise)))}<small> / hour</small></div>${button('View station ↗', `#/station/${s._id}`)}</div></div></article>`;
}
async function home() {
  app.innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow">MORE MILES. FEWER WORRIES.</div><h1>Your next charge.<br><em>Just around the corner.</em></h1><p>Find a charger, reserve your spot, and get back to what moves you.</p><div class="hero-note"><span>Find your connector</span><span>Reserve ahead</span><span>Travel with confidence</span></div></div><div class="charger-art" aria-hidden="true"><div class="art-orbit"></div><div class="art-cable"></div><div class="art-plug"></div><div class="art-charger"><div class="art-screen">ϟ</div><div class="art-light"></div></div><div class="floating-charge">A LITTLE POWER.<strong>A long way.</strong></div></div></section><form id="search-form"><div class="toolbar"><div class="search-box"><span class="search-icon">⌕</span><input name="q" aria-label="Search city or area" placeholder="Where are you headed? Search city or area"></div><button class="button" type="submit">Find stations ↗</button><button class="button secondary" type="button" id="nearby">◎ Near me</button></div><div class="filter-row"><span class="filter-label">Filter by</span><select name="connector" aria-label="Connector"><option value="">All connectors</option>${connectors.map((c) => `<option>${c}</option>`).join('')}</select><select name="minPower" aria-label="Minimum power"><option value="">Any charging speed</option><option value="22">22 kW and above</option><option value="50">50 kW and above</option><option value="100">100 kW and above</option></select><details><summary>Check a specific time</summary><div class="date-filters"><label>Start (your local time)<input name="startAt" type="datetime-local" step="1800"></label><label>End (your local time)<input name="endAt" type="datetime-local" step="1800"></label></div></details></div></form><div class="results-heading"><div><h2>Find your next stop <small id="result-count"></small></h2></div><div class="view-toggle"><button id="list-view" class="active">▦ List</button><button id="map-view">⌖ Map</button></div></div><div id="map" class="map hidden"></div><div id="stations" class="station-grid"><div class="loading">Finding stations…</div></div><p class="small-text muted mt-3">Availability reflects reservations in Voltway. Station information is maintained by admins.</p>`;
  let coordinates = null,
    stations = [],
    searchId = 0;
  async function search(data = {}) {
    const id = ++searchId;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data))
      if (value)
        params.set(key, ['startAt', 'endAt'].includes(key) ? new Date(value).toISOString() : value);
    if (coordinates) {
      params.set('lat', coordinates.latitude);
      params.set('lng', coordinates.longitude);
    }
    const target = document.querySelector('#stations');
    target.innerHTML = '<div class="loading">Finding stations…</div>';
    try {
      stations = await api('/api/stations?' + params);
      if (id !== searchId || !target.isConnected) return;
      target.innerHTML = stations.length
        ? stations.map(stationCard).join('')
        : '<div class="empty">No stations match these filters. Try another city, connector or time.</div>';
      document.querySelector('#result-count').textContent =
        `${stations.length} stations to explore`;
      if (!document.querySelector('#map').classList.contains('hidden')) mountMap(stations);
    } catch (err) {
      if (target.isConnected)
        target.innerHTML = `<div class="empty error">${e(err.message)}<br>Check your connection and search again.</div>`;
    }
  }
  bindForm('search-form', search);
  document.querySelector('#nearby').onclick = () => {
    if (!navigator.geolocation) {
      toast('Location is unavailable. Search by city instead.', true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        coordinates = pos.coords;
        search(Object.fromEntries(new FormData(document.querySelector('#search-form'))));
      },
      () => toast('Location permission unavailable. You can still search by city.', true),
    );
  };
  document.querySelector('#map-view').onclick = () => {
    document.querySelector('#map').classList.remove('hidden');
    document.querySelector('#map-view').classList.add('active');
    document.querySelector('#list-view').classList.remove('active');
    mountMap(stations);
  };
  document.querySelector('#list-view').onclick = () => {
    document.querySelector('#map').classList.add('hidden');
    document.querySelector('#list-view').classList.add('active');
    document.querySelector('#map-view').classList.remove('active');
  };
  await search();
}
async function authPage(register = false) {
  app.innerHTML = `<div class="auth-layout panel"><div class="eyebrow">WELCOME TO VOLTWAY</div><h1>${register ? 'Your journey starts here.' : 'Good to see you again.'}</h1><p>${register ? 'Create an account to save your vehicle and reserve your next charge.' : 'Sign in and pick up where you left off.'}</p><form id="auth-form">${register ? field('Full name', 'name', 'text', '', 'required autocomplete="name"') + field('Phone number', 'phone', 'tel', '', 'required autocomplete="tel"') : ''}${field('Email address', 'email', 'email', '', 'required autocomplete="email"')}${field('Password', 'password', 'password', '', 'required minlength="10" maxlength="128" autocomplete="' + (register ? 'new-password' : 'current-password') + '"')}${register ? field('Confirm password', 'confirmation', 'password', '', 'required minlength="10" autocomplete="new-password"') : ''}<button type="submit" class="button w-100">${register ? 'Create account' : 'Sign in'} →</button></form><p class="small-text mt-4 mb-0">${register ? 'Already part of the journey? <a href="#/login">Sign in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p></div>`;
  bindForm('auth-form', async (data) => {
    if (register && data.password !== data.confirmation) throw new Error('Passwords do not match.');
    const result = await api(`/api/auth/${register ? 'register' : 'login'}`, 'POST', data);
    user = result.user;
    toast(register ? 'Your account is ready.' : 'Welcome back.');
    location.hash = sessionStorage.getItem('returnTo') || '#/';
    sessionStorage.removeItem('returnTo');
  });
}
function requireUser() {
  if (user) return true;
  sessionStorage.setItem('returnTo', location.hash);
  location.hash = '#/login';
  return false;
}
async function stationPage(id) {
  const [s, reviews, vehicles] = await Promise.all([
    api(`/api/stations/${id}`),
    api(`/api/stations/${id}/reviews`),
    user ? api('/api/vehicles') : Promise.resolve([]),
  ]);
  app.innerHTML = `${heading(e(s.name), `⌖ ${e(s.address)}, ${e(s.city)}, ${e(s.state)}`, button('← All stations', '#/', 'ghost'))}<div class="two-column"><div><div class="panel"><div class="eyebrow">YOUR NEXT CHARGING STOP</div><p>${e(s.description)}</p><div class="station-specs"><span class="spec">${e(s.openingHours.open)} – ${e(s.openingHours.close)}</span><span class="spec">${e(s.timeZone)}</span><span class="spec">${e(s.contactPhone)}</span></div><div id="map" class="map"></div><h3>Charging options</h3>${s.chargers.map((c) => `<div class="summary-row"><span>${e(c.chargerCode)} · ${e(c.connectorType)} · ${c.powerKw} kW</span><span>${money(c.pricePerHourPaise)}/hr ${badge(c.operationalStatus)}</span></div>`).join('')}</div><section class="panel"><h2>From the charging community</h2>${reviews.length ? reviews.map((r) => `<div class="review"><span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span><p>${e(r.comment)}</p><small class="muted">${e(r.userId?.name || 'Driver')} · Verified completed booking</small></div>`).join('') : '<p>No reviews yet. Complete a charging session to leave the first one.</p>'}</section></div><div><section class="panel"><div class="step-label">01 / PLAN YOUR CHARGE</div><h2>A spot, just for you.</h2><p class="small-text">Choose a charger and a time. All slots below use ${e(s.timeZone)}.</p><form id="slot-form">${select(
    'Charger',
    'charger',
    s.chargers
      .filter((c) => c.operationalStatus === 'active')
      .map((c) => [c._id, `${c.chargerCode} · ${c.connectorType} · ${c.powerKw} kW`]),
  )}${field('Charging date', 'date', 'date', dateInZone(new Date(), s.timeZone), 'required')}${select(
    'Duration',
    'duration',
    [1, 2, 3, 4, 6].map((blocks) => {
      const minutes = blocks * configuration.blockMinutes;
      return [String(minutes), `${minutes} minutes`];
    }),
    String(configuration.blockMinutes * 2),
  )}<label>Available start times</label><div id="slots" class="slots"></div>${
    user
      ? select(
          'Your vehicle',
          'vehicle',
          vehicles
            .filter((v) => v.isActive)
            .map((v) => [
              v._id,
              `${v.manufacturer} ${v.model} · ${v.registrationNumber} (${v.connectorType})`,
            ]),
        )
      : '<p class="notice">Sign in to reserve your charging session.</p>'
  }${user && !vehicles.some((v) => v.isActive) ? '<p class="notice">Add a vehicle before booking. <a href="#/vehicles">Go to My vehicles →</a></p>' : ''}<div class="summary-row total"><span>Estimated total</span><strong id="estimate">—</strong></div><p class="small-text mt-3">A ${configuration.holdMinutes}-minute hold protects your slot during demo payment. Free cancellation before your session starts.</p><button class="button w-100" type="submit">${user ? 'Continue to booking summary' : 'Sign in to book'} →</button></form></section></div></div>`;
  mountMap([s]);
  let selected = null,
    slots = [];
  let availabilityRequest = 0;
  const form = document.querySelector('#slot-form');
  form.date.min = dateInZone(new Date(), s.timeZone);
  form.date.max = dateInZone(
    new Date(Date.now() + configuration.horizonDays * 86400000),
    s.timeZone,
  );
  async function loadSlots() {
    const request = ++availabilityRequest;
    selected = null;
    slots = [];
    const holder = document.querySelector('#slots');
    holder.innerHTML = '<small class="muted">Loading slots…</small>';
    if (!form.charger.value) {
      holder.innerHTML = '<small>No active chargers.</small>';
      return;
    }
    try {
      const result = await api(
        `/api/chargers/${form.charger.value}/availability?date=${form.date.value}`,
      );
      if (request !== availabilityRequest || !form.isConnected) return;
      slots = result.slots;
      drawSlots();
    } catch (err) {
      if (request === availabilityRequest && holder.isConnected) holder.textContent = err.message;
    }
  }
  function drawSlots() {
    selected = null;
    const duration = Number(form.duration.value),
      required = duration / configuration.blockMinutes;
    document.querySelector('#slots').innerHTML = slots
      .map((slot, i) => {
        const segment = slots.slice(i, i + required);
        const available = segment.length === required && segment.every((x) => x.available);
        return `<button type="button" class="slot" data-index="${i}" ${available ? '' : 'disabled'}>${slot.label}</button>`;
      })
      .join('');
    document.querySelectorAll('.slot').forEach(
      (btn) =>
        (btn.onclick = () => {
          selected = slots[Number(btn.dataset.index)];
          document.querySelectorAll('.slot').forEach((x) => x.classList.remove('selected'));
          btn.classList.add('selected');
        }),
    );
    const c = s.chargers.find((c) => c._id === form.charger.value);
    document.querySelector('#estimate').textContent = money((c.pricePerHourPaise * duration) / 60);
  }
  form.charger.onchange = loadSlots;
  form.date.onchange = loadSlots;
  form.duration.onchange = drawSlots;
  bindForm('slot-form', async (data) => {
    if (!requireUser()) return;
    if (!selected) throw new Error('Choose an available start time.');
    if (!data.vehicle) throw new Error('Add an active vehicle first.');
    const booking = await api('/api/bookings', 'POST', {
      chargerId: data.charger,
      vehicleId: data.vehicle,
      startAt: selected.startAt,
      endAt: new Date(+new Date(selected.startAt) + Number(data.duration) * 60000).toISOString(),
    });
    location.hash = `#/booking/${booking._id}`;
  });
  await loadSlots();
}
async function bookingsPage() {
  if (!requireUser()) return;
  const bookings = await api('/api/bookings');
  app.innerHTML = `${heading('Your charging journey.', 'All your reservations, in one place.', button('Find a station ↗', '#/'))}<div class="filter-row"><select id="booking-filter" aria-label="Filter booking history"><option value="">All bookings</option>${['pending_payment', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'].map((s) => `<option value="${s}">${s.replaceAll('_', ' ')}</option>`).join('')}</select><span class="small-text muted">Times shown in each station’s time zone.</span></div><div id="booking-list"></div>`;
  const draw = () => {
    const filter = document.querySelector('#booking-filter').value,
      list = bookings.filter((b) => !filter || b.status === filter);
    document.querySelector('#booking-list').innerHTML = list.length
      ? list
          .map(
            (b) =>
              `<article class="booking-row"><div><small class="muted">${e(b.bookingReference)}</small><h3>${e(b.stationSnapshot.name)}</h3><p>${e(dateTime(b.startAt, b.stationSnapshot.timeZone))} · ${e(b.priceSnapshot.connectorType)}</p></div><div class="right">${badge(b.status)}<p class="my-2">${money(b.amountPaise)}</p>${button('View reservation →', `#/booking/${b._id}`, 'secondary')}</div></article>`,
          )
          .join('')
      : '<div class="empty">No bookings here yet. Your next journey starts with a charging spot.</div>';
  };
  document.querySelector('#booking-filter').onchange = draw;
  draw();
}
async function bookingPage(id) {
  if (!requireUser()) return;
  const b = await api(`/api/bookings/${id}`),
    pending = b.status === 'pending_payment',
    zone = b.stationSnapshot.timeZone;
  app.innerHTML = `${heading(pending ? 'One more step to your next stop.' : b.status === 'confirmed' ? 'You’re all charged up to go.' : 'Your reservation.', e(b.bookingReference), button('← My bookings', '#/bookings', 'ghost'))}<div class="two-column"><section class="panel">${!pending ? '<div class="checkmark">' + (b.status === 'cancelled' || b.status === 'expired' ? '−' : '✓') + '</div>' : '<div class="step-label">02 / REVIEW YOUR BOOKING</div>'}<h2>${e(b.stationSnapshot.name)}</h2><p>${e(b.stationSnapshot.address)}, ${e(b.stationSnapshot.city)}</p>${badge(b.status)}${[
    [
      'Vehicle',
      `${b.vehicleSnapshot.manufacturer} ${b.vehicleSnapshot.model} · ${b.vehicleSnapshot.registrationNumber}`,
    ],
    [
      'Charger',
      `${b.priceSnapshot.chargerCode} · ${b.priceSnapshot.connectorType} · ${b.priceSnapshot.powerKw} kW`,
    ],
    ['Starts', dateTime(b.startAt, zone)],
    ['Ends', dateTime(b.endAt, zone)],
    ['Station time zone', zone],
    ['Hourly rate', money(b.priceSnapshot.pricePerHourPaise)],
  ]
    .map(([k, v]) => `<div class="summary-row"><span>${k}</span><span>${e(v)}</span></div>`)
    .join(
      '',
    )}<div class="summary-row total"><span>Total</span><strong>${money(b.amountPaise)}</strong></div><p class="small-text mt-3">Cancel before the session begins for a full simulated refund. No money is charged or refunded.</p>${['pending_payment', 'confirmed'].includes(b.status) && new Date(b.startAt) > new Date() ? '<button id="cancel-booking" class="button danger">Cancel reservation</button>' : ''}</section><div>${pending ? `<section class="panel"><div class="step-label">03 / DEMO PAYMENT</div><h2>Make it yours.</h2><div class="notice">Demo payment — no real money will be charged.</div><p>Complete a simulated payment to confirm your reservation.</p><p>Your slot is held for <strong id="hold-clock" class="hold-clock"></strong></p><div class="actions"><button class="button" id="pay-success">Simulate success ✓</button><button class="button secondary" id="pay-failed">Simulate failure</button>${button('Cancel and return to bookings', '#/bookings', 'ghost')}</div><p class="small-text mt-3">Leaving this page keeps the hold until it expires. Use “Cancel reservation” to release it immediately.</p></section>` : ''}${b.status === 'expired' ? '<div class="notice">Your payment hold expired. Choose a new available time to book again.</div>' + button('Choose another slot', `#/station/${b.stationId}`) : ''}${
    b.status === 'completed' && !b.review
      ? `<section class="panel"><h2>How was your charge?</h2><form id="review-form">${select(
          'Your rating',
          'rating',
          [
            ['5', '★★★★★ — Excellent'],
            ['4', '★★★★☆ — Good'],
            ['3', '★★★☆☆ — Okay'],
            ['2', '★★☆☆☆ — Poor'],
            ['1', '★☆☆☆☆ — Very poor'],
          ],
        )}<div class="field"><label for="comment">Your experience</label><textarea id="comment" name="comment" required minlength="3" maxlength="1000" rows="4"></textarea></div><button class="button" type="submit">Share review →</button></form></section>`
      : ''
  }${b.review ? `<section class="panel"><h2>Your review</h2><div class="stars">${'★'.repeat(b.review.rating)}</div><p>${e(b.review.comment)}</p></section>` : ''}<section class="panel"><h2>Payment activity</h2>${b.payments.length ? b.payments.map((p) => `<div class="summary-row"><span>Simulated · ${money(p.amountPaise)}<br><small>${e(dateTime(p.processedAt, zone))}</small></span>${badge(p.status)}</div>`).join('') : '<p>No simulated payments yet.</p>'}${b.refunds.map((r) => `<div class="notice mt-3">Full simulated refund: ${money(r.amountPaise)}<br><small>${e(r.refundReference)}</small></div>`).join('')}</section></div></div>`;
  document.querySelector('#cancel-booking')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try {
      await api(`/api/bookings/${id}/cancel`, 'POST', {});
      toast('Reservation cancelled. Any eligible simulated refund has been issued.');
      await render();
    } catch (err) {
      toast(err.message, true);
      ev.target.disabled = false;
    }
  });
  if (pending) {
    const tick = () => {
      const seconds = Math.max(0, Math.floor((new Date(b.holdExpiresAt) - Date.now()) / 1000));
      const el = document.querySelector('#hold-clock');
      if (el)
        el.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      if (seconds === 0) {
        clearInterval(countdown);
        render();
      }
    };
    countdown = setInterval(tick, 1000);
    tick();
    for (const outcome of ['success', 'failed'])
      document.querySelector(`#pay-${outcome}`)?.addEventListener('click', async () => {
        document.querySelectorAll('[id^="pay-"]').forEach((el) => (el.disabled = true));
        try {
          await api(`/api/bookings/${id}/payments/simulate`, 'POST', {
            outcome,
            idempotencyKey: crypto.randomUUID(),
          });
          toast(
            outcome === 'success'
              ? 'Your booking is confirmed.'
              : 'Simulated payment failed. You can retry before the hold expires.',
            outcome === 'failed',
          );
          await render();
        } catch (err) {
          toast(err.message, true);
          await render();
        }
      });
  }
  bindForm('review-form', async (data) => {
    await api(`/api/bookings/${id}/review`, 'POST', {
      rating: Number(data.rating),
      comment: data.comment,
    });
    toast('Thanks for sharing your experience.');
    await render();
  });
}
async function vehiclesPage() {
  if (!requireUser()) return;
  const vehicles = await api('/api/vehicles');
  app.innerHTML = `${heading('Your electric garage.', 'Save your vehicles for a smoother booking experience.')}<div class="two-column"><div>${vehicles.length ? vehicles.map((v) => `<article class="booking-row"><div><small class="eyebrow">${e(v.registrationNumber)}</small><h3>${e(v.manufacturer)} ${e(v.model)}</h3><p>${e(v.connectorType)} · ${e(v.vehicleType)} ${v.batteryCapacityKwh ? `· ${v.batteryCapacityKwh} kWh` : ''}</p></div><div>${badge(v.isActive ? 'active' : 'inactive')}<div class="actions"><button class="button secondary edit-vehicle" data-id="${v._id}">Edit</button>${v.isActive ? `<button class="button ghost deactivate" data-id="${v._id}">Deactivate</button>` : ''}</div></div></article>`).join('') : '<div class="empty">Your garage is empty. Add your first electric vehicle.</div>'}</div><section class="panel"><h2 id="vehicle-title">Add a vehicle</h2><form id="vehicle-form"><input name="id" type="hidden"><div class="form-grid">${field('Registration number', 'registrationNumber', 'text', '', 'required')}${field('Manufacturer', 'manufacturer', 'text', '', 'required')}${field('Model', 'model', 'text', '', 'required')}${select('Vehicle type', 'vehicleType', ['car', 'bike', 'van', 'bus'])}${select('Connector', 'connectorType', connectors)}${field('Battery capacity (kWh, optional)', 'batteryCapacityKwh', 'number', '', 'min="1" max="2000" step="0.1"')}</div><button class="button" type="submit">Save vehicle →</button><button class="button ghost" type="reset">Clear</button></form></section></div>`;
  bindForm('vehicle-form', async (data) => {
    const id = data.id;
    delete data.id;
    if (data.batteryCapacityKwh) data.batteryCapacityKwh = Number(data.batteryCapacityKwh);
    else delete data.batteryCapacityKwh;
    await api('/api/vehicles' + (id ? `/${id}` : ''), id ? 'PATCH' : 'POST', data);
    toast('Vehicle saved.');
    await render();
  });
  document.querySelectorAll('.edit-vehicle').forEach(
    (btn) =>
      (btn.onclick = () => {
        const v = vehicles.find((v) => v._id === btn.dataset.id),
          form = document.querySelector('#vehicle-form');
        for (const name of [
          'registrationNumber',
          'manufacturer',
          'model',
          'vehicleType',
          'connectorType',
          'batteryCapacityKwh',
        ])
          form.elements[name].value = v[name] || '';
        form.elements.id.value = v._id;
        document.querySelector('#vehicle-title').textContent = 'Edit vehicle';
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }),
  );
  document.querySelectorAll('.deactivate').forEach(
    (btn) =>
      (btn.onclick = async () => {
        try {
          await api(`/api/vehicles/${btn.dataset.id}`, 'DELETE');
          toast('Vehicle deactivated. Existing booking history is preserved.');
          await render();
        } catch (err) {
          toast(err.message, true);
        }
      }),
  );
}
async function profilePage() {
  if (!requireUser()) return;
  app.innerHTML = `${heading('Make yourself at home.', 'Keep your driver profile up to date.')}<section class="panel" style="max-width:600px"><h2>Your profile</h2><p>${e(user.email)}</p><form id="profile-form">${field('Full name', 'name', 'text', user.name, 'required')}${field('Phone number', 'phone', 'tel', user.phone, 'required')}<button class="button" type="submit">Save changes →</button></form></section>`;
  bindForm('profile-form', async (data) => {
    user = await api('/api/users/me', 'PATCH', data);
    navigation();
    toast('Profile updated.');
  });
}
async function notificationsPage() {
  if (!requireUser()) return;
  const items = await api('/api/notifications');
  app.innerHTML =
    heading('You’re in the loop.', 'Booking confirmations, cancellations and updates.') +
    (items.length
      ? items
          .map(
            (n) =>
              `<article class="booking-row notification ${n.readAt ? '' : 'unread'}"><div><p>${e(n.message)}</p><small class="muted">${e(dateTime(n.createdAt))}</small></div>${n.readAt ? badge('read') : `<button class="button secondary mark-read" data-id="${n._id}">Mark read</button>`}</article>`,
          )
          .join('')
      : '<div class="empty">You’re all caught up. Booking updates will appear here.</div>');
  document.querySelectorAll('.mark-read').forEach(
    (btn) =>
      (btn.onclick = async () => {
        try {
          await api(`/api/notifications/${btn.dataset.id}/read`, 'PATCH', {});
          await render();
        } catch (err) {
          toast(err.message, true);
        }
      }),
  );
}
async function render() {
  const version = ++renderVersion;
  clearInterval(countdown);
  if (map) {
    map.remove();
    map = null;
  }
  document.querySelector('.sidebar').classList.remove('open');
  navigation();
  app.innerHTML = '<div class="loading">Getting things ready…</div>';
  const [, page = '', id = '', action = ''] = location.hash.split('/');
  try {
    if (page === 'login' || page === 'register') await authPage(page === 'register');
    else if (page === 'station') await stationPage(id);
    else if (page === 'booking') await bookingPage(id);
    else if (page === 'bookings') await bookingsPage();
    else if (page === 'vehicles') await vehiclesPage();
    else if (page === 'profile') await profilePage();
    else if (page === 'notifications') await notificationsPage();
    else if (page === 'admin') {
      if (!requireUser()) return;
      if (user.role !== 'admin') throw new Error('Admin access required.');
      await renderAdmin(app, id || 'dashboard', action, render);
    } else await home();
  } catch (err) {
    if (version === renderVersion)
      app.innerHTML = `<div class="empty error">${e(err.message)}<div class="actions justify-content-center">${button('Back to stations', '#/', 'secondary')}<button class="button" id="retry">Try again</button></div></div>`;
    document.querySelector('#retry')?.addEventListener('click', render);
  }
}
document.querySelector('#mobile-menu').onclick = () =>
  document.querySelector('.sidebar').classList.toggle('open');
window.addEventListener('hashchange', render);
try {
  const data = await api('/api/auth/me');
  user = data.user;
  configuration = data.config;
  await render();
} catch (err) {
  app.innerHTML = `<div class="empty error">Unable to connect: ${e(err.message)}. Start the backend and reload this page.</div>`;
}
