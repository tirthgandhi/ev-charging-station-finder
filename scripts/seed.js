import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { User, Station, Charger, initializeModels } from '../src/models/index.js';
const cfg = config();
if (
  !process.env.ADMIN_EMAIL ||
  !process.env.ADMIN_PASSWORD ||
  process.env.ADMIN_PASSWORD.length < 12 ||
  process.env.ADMIN_PASSWORD.startsWith('replace-')
)
  throw new Error('Set ADMIN_EMAIL and a strong ADMIN_PASSWORD (12+ characters).');
await mongoose.connect(cfg.mongoUri);
await initializeModels();
await User.updateOne(
  { email: process.env.ADMIN_EMAIL.toLowerCase() },
  {
    $setOnInsert: {
      name: 'Station administrator',
      email: process.env.ADMIN_EMAIL.toLowerCase(),
      phone: '+91 9000000000',
      role: 'admin',
      status: 'active',
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12),
    },
  },
  { upsert: true },
);
const samples = [
  ['Alkapuri Charge Hub', 'Alkapuri', 'Vadodara', 73.1733, 22.3101],
  ['Riverfront Electric', 'Sabarmati Riverfront', 'Ahmedabad', 72.5714, 23.0225],
  ['Vesu Fast Charge', 'Vesu', 'Surat', 72.7808, 21.1418],
  ['Sayaji Green Station', 'Sayajigunj', 'Vadodara', 73.1812, 22.3072],
  ['GIFT City Power Point', 'GIFT City', 'Gandhinagar', 72.6846, 23.1639],
  ['Satellite Charge Lounge', 'Satellite', 'Ahmedabad', 72.517, 23.028],
];
for (const [name, address, city, lng, lat] of samples) {
  let station = await Station.findOne({ name });
  if (!station)
    station = await Station.create({
      name,
      description:
        'Demonstration station. Sample operational information for the academic project.',
      address,
      city,
      state: 'Gujarat',
      postalCode: '390001',
      location: { type: 'Point', coordinates: [lng, lat] },
      timeZone: 'Asia/Kolkata',
      contactPhone: '+91 9000000000',
      openingHours: { open: '06:00', close: '23:30' },
      status: 'active',
    });
  for (const [code, connector, power, price] of [
    ['DC-01', 'CCS2', 60, 18000],
    ['AC-01', 'Type 2', 22, 9000],
  ])
    await Charger.updateOne(
      { stationId: station._id, chargerCode: code },
      {
        $setOnInsert: {
          stationId: station._id,
          chargerCode: code,
          connectorType: connector,
          powerKw: power,
          pricePerHourPaise: price,
          operationalStatus: 'active',
        },
      },
      { upsert: true },
    );
}
console.log(
  'Sample stations and controlled admin account are ready. Existing records were preserved.',
);
await mongoose.disconnect();
