let csrf;
export async function api(url, method = 'GET', body) {
  if (method !== 'GET' && !csrf) csrf = (await api('/api/auth/csrf')).token;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response
    .json()
    .catch(() => ({ error: 'The server could not complete this request.' }));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  if (data.csrf) csrf = data.csrf;
  if (url === '/api/auth/logout') csrf = null;
  return data;
}
export const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const money = (paise) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format((paise || 0) / 100);
export const dateTime = (value, zone = 'Asia/Kolkata') =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: zone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
export const dateInZone = (value = new Date(), zone = 'Asia/Kolkata') =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
export function toast(message, error = false) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.className = `show${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ''), 5000);
}
export function formData(form) {
  return Object.fromEntries(new FormData(form));
}
export function bindForm(id, callback) {
  document.getElementById(id)?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type=submit]');
    if (button) button.disabled = true;
    try {
      await callback(formData(event.currentTarget), event.currentTarget);
    } catch (e) {
      toast(e.message, true);
    } finally {
      if (button) button.disabled = false;
    }
  });
}
export const badge = (status) =>
  `<span class="badge-status ${escape(status)}">${escape(status.replaceAll('_', ' '))}</span>`;
export const field = (label, name, type = 'text', value = '', extra = '') =>
  `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escape(value)}" ${extra}></div>`;
export const select = (label, name, options, value = '') =>
  `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">${options.map((v) => `<option value="${escape(Array.isArray(v) ? v[0] : v)}" ${value === (Array.isArray(v) ? v[0] : v) ? 'selected' : ''}>${escape(Array.isArray(v) ? v[1] : v)}</option>`).join('')}</select></div>`;
export const connectors = ['CCS2', 'Type 2', 'CHAdeMO', 'Bharat AC'];
