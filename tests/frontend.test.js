import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectChargingPair } from '../public/assets/booking-selection.js';
import { resolveRoute } from '../public/assets/routes.js';
const vehicles = [
  { _id: 'car', isActive: true, connectorType: 'CCS2' },
  { _id: 'bike', isActive: true, connectorType: 'Type 2' },
  { _id: 'old', isActive: false, connectorType: 'CCS2' },
];
const chargers = [
  { _id: 'ac', connectorType: 'Type 2', operationalStatus: 'active' },
  { _id: 'dc', connectorType: 'CCS2', operationalStatus: 'active' },
];
test('saved CCS2 vehicle remains visible and selects DC despite AC being first', () => {
  const pair = selectChargingPair(vehicles, chargers, 'car', 'ac');
  assert.equal(pair.vehicle._id, 'car');
  assert.equal(pair.charger._id, 'dc');
  assert.deepEqual(
    pair.activeVehicles.map((v) => v._id),
    ['car', 'bike'],
  );
});
test('changing vehicle selects its compatible charger', () => {
  assert.equal(selectChargingPair(vehicles, chargers, 'bike', 'dc').charger._id, 'ac');
});
test('unsupported saved vehicles remain visible without allowing incompatible booking', () => {
  const pair = selectChargingPair(vehicles, [chargers[0]], 'car');
  assert.equal(pair.vehicle._id, 'car');
  assert.equal(pair.activeVehicles.length, 2);
  assert.equal(pair.compatible, false);
});
test('empty and deactivated vehicle collections are handled safely', () => {
  assert.equal(selectChargingPair([], chargers).compatible, false);
  assert.equal(selectChargingPair([vehicles[2]], chargers).activeVehicles.length, 0);
});
test('maintenance chargers are not automatically selected', () => {
  assert.equal(
    selectChargingPair(vehicles, [{ ...chargers[1], operationalStatus: 'maintenance' }], 'car')
      .compatible,
    false,
  );
});
test('all public and customer pages have explicit routes', () => {
  for (const hash of [
    '',
    '#/',
    '#/login',
    '#/register',
    '#/bookings',
    '#/vehicles',
    '#/profile',
    '#/notifications',
  ])
    assert.ok(resolveRoute(hash), hash);
  assert.equal(resolveRoute('#/vehicles/').name, 'vehicles');
  assert.equal(resolveRoute('#/bookings').protected, true);
});
test('record and admin routes validate IDs and page names', () => {
  const id = 'a'.repeat(24);
  assert.equal(resolveRoute(`#/station/${id}`).name, 'station');
  assert.equal(resolveRoute(`#/booking/${id}`).protected, true);
  for (const page of [
    'dashboard',
    'stations',
    'chargers',
    'bookings',
    'users',
    'payments',
    'reports',
  ])
    assert.equal(resolveRoute(`#/admin/${page}`).admin, true);
  assert.ok(resolveRoute(`#/admin/stations/${id}`));
  for (const hash of [
    '#/station/nope',
    '#/booking',
    '#/unknown',
    '#/admin/unknown',
    `#/admin/users/${id}`,
    '#/vehicles/extra',
  ])
    assert.equal(resolveRoute(hash), null, hash);
});
