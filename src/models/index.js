import mongoose from 'mongoose';
const { Schema } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name, required: true });
const make = (name, fields, indexes = []) => {
  const s = new Schema(fields, { timestamps: true });
  for (const [keys, opts] of indexes) s.index(keys, opts);
  return mongoose.model(name, s);
};
export const User = make('User', {
  name: String,
  email: { type: String, unique: true },
  phone: String,
  passwordHash: { type: String, select: false },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
});
export const Vehicle = make('Vehicle', {
  userId: ref('User'),
  registrationNumber: String,
  manufacturer: String,
  model: String,
  vehicleType: String,
  connectorType: String,
  batteryCapacityKwh: Number,
  isActive: { type: Boolean, default: true },
});
export const Station = make(
  'Station',
  {
    name: String,
    description: String,
    address: String,
    city: String,
    state: String,
    postalCode: String,
    location: { type: { type: String, default: 'Point' }, coordinates: [Number] },
    timeZone: String,
    contactPhone: String,
    openingHours: { open: String, close: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    imageUrl: String,
  },
  [[{ location: '2dsphere' }, {}]],
);
export const Charger = make(
  'Charger',
  {
    stationId: ref('Station'),
    chargerCode: String,
    connectorType: String,
    powerKw: Number,
    pricePerHourPaise: Number,
    operationalStatus: {
      type: String,
      enum: ['active', 'maintenance', 'inactive'],
      default: 'active',
    },
  },
  [[{ stationId: 1, chargerCode: 1 }, { unique: true }]],
);
export const Booking = make('Booking', {
  bookingReference: { type: String, unique: true },
  userId: ref('User'),
  vehicleId: ref('Vehicle'),
  stationId: ref('Station'),
  chargerId: ref('Charger'),
  startAt: Date,
  endAt: Date,
  status: {
    type: String,
    enum: ['pending_payment', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'],
  },
  amountPaise: Number,
  currency: { type: String, default: 'INR' },
  priceSnapshot: Schema.Types.Mixed,
  stationSnapshot: Schema.Types.Mixed,
  vehicleSnapshot: Schema.Types.Mixed,
  holdExpiresAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
});
export const Block = make(
  'ReservationBlock',
  {
    chargerId: ref('Charger'),
    blockStartAt: Date,
    bookingId: ref('Booking'),
    state: { type: String, enum: ['hold', 'confirmed'] },
    holdExpiresAt: Date,
  },
  [[{ chargerId: 1, blockStartAt: 1 }, { unique: true }]],
);
export const Payment = make(
  'Payment',
  {
    bookingId: ref('Booking'),
    transactionReference: String,
    amountPaise: Number,
    currency: { type: String, default: 'INR' },
    mode: { type: String, default: 'simulated' },
    status: String,
    idempotencyKey: String,
    processedAt: Date,
  },
  [
    [{ bookingId: 1, idempotencyKey: 1 }, { unique: true }],
    [{ bookingId: 1 }, { unique: true, partialFilterExpression: { status: 'success' } }],
  ],
);
export const Refund = make('Refund', {
  bookingId: { ...ref('Booking'), unique: true },
  paymentId: ref('Payment'),
  refundReference: String,
  amountPaise: Number,
  status: { type: String, default: 'success' },
  mode: { type: String, default: 'simulated' },
  processedAt: Date,
});
export const Review = make('Review', {
  bookingId: { ...ref('Booking'), unique: true },
  userId: ref('User'),
  stationId: ref('Station'),
  rating: Number,
  comment: String,
});
export const Notification = make('Notification', {
  recipientId: ref('User'),
  bookingId: ref('Booking'),
  type: String,
  message: String,
  readAt: Date,
});
export async function initializeModels() {
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}
