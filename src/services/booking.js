import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import {
  Booking,
  Block,
  Station,
  Charger,
  Vehicle,
  Payment,
  Refund,
  User,
  Notification,
} from '../models/index.js';
import { fail } from '../validation.js';
export function period(startAt, endAt, station, cfg, now = new Date()) {
  const start = new Date(startAt),
    end = new Date(endAt),
    step = cfg.blockMinutes * 60000;
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    start <= now ||
    end <= start ||
    end > new Date(+now + cfg.horizonDays * 86400000)
  )
    fail(400, 'Choose a future period within the booking horizon.');
  const local = DateTime.fromJSDate(start, { zone: station.timeZone }),
    last = DateTime.fromJSDate(end, { zone: station.timeZone });
  if (
    local.minute % cfg.blockMinutes ||
    last.minute % cfg.blockMinutes ||
    local.second ||
    last.second ||
    local.millisecond ||
    last.millisecond ||
    (end - start) % step
  )
    fail(400, `Times must align to ${cfg.blockMinutes}-minute blocks.`);
  if (
    local.toISODate() !== last.toISODate() ||
    local.toFormat('HH:mm') < station.openingHours.open ||
    last.toFormat('HH:mm') > station.openingHours.close
  )
    fail(400, 'The requested period is outside station opening hours.');
  const blocks = [];
  for (let t = +start; t < +end; t += step) blocks.push(new Date(t));
  return { start, end, blocks };
}
export const busyQuery = (now = new Date()) => ({
  $or: [{ state: 'confirmed' }, { state: 'hold', holdExpiresAt: { $gt: now } }],
});
async function transaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (e) {
    if (e.code === 11000)
      fail(
        409,
        'This reservation conflicts with an existing record. Refresh availability and retry.',
      );
    throw e;
  } finally {
    await session.endSession();
  }
}
async function notify(booking, type, message, session) {
  const admins = await User.find({ role: 'admin', status: 'active' }).session(session);
  await Notification.insertMany(
    [...new Set([String(booking.userId), ...admins.map((x) => String(x._id))])].map(
      (recipientId) => ({ recipientId, bookingId: booking._id, type, message }),
    ),
    { session },
  );
}
export async function reserve(userId, input, cfg) {
  return transaction(async (session) => {
    const now = new Date();
    const charger = await Charger.findById(input.chargerId).session(session);
    if (!charger || charger.operationalStatus !== 'active') fail(409, 'Charger is unavailable.');
    const station = await Station.findById(charger.stationId).session(session);
    if (!station || station.status !== 'active') fail(409, 'Station is unavailable.');
    const vehicle = await Vehicle.findOne({ _id: input.vehicleId, userId, isActive: true }).session(
      session,
    );
    if (!vehicle) fail(404, 'Choose one of your active vehicles.');
    if (vehicle.connectorType !== charger.connectorType)
      fail(400, 'Vehicle connector does not match this charger.');
    const { start, end, blocks } = period(input.startAt, input.endAt, station, cfg, now);
    const holdExpiresAt = new Date(+now + cfg.holdMinutes * 60000);
    const bookingId = new mongoose.Types.ObjectId();
    await Block.deleteMany({
      chargerId: charger._id,
      blockStartAt: { $in: blocks },
      state: 'hold',
      holdExpiresAt: { $lte: now },
    }).session(session);
    await Block.insertMany(
      blocks.map((blockStartAt) => ({
        chargerId: charger._id,
        blockStartAt,
        bookingId,
        state: 'hold',
        holdExpiresAt,
      })),
      { session },
    );
    const [booking] = await Booking.create(
      [
        {
          _id: bookingId,
          bookingReference: `EV-${randomUUID().slice(0, 8).toUpperCase()}`,
          userId,
          vehicleId: vehicle._id,
          stationId: station._id,
          chargerId: charger._id,
          startAt: start,
          endAt: end,
          status: 'pending_payment',
          amountPaise: Math.round((charger.pricePerHourPaise * (end - start)) / 3600000),
          holdExpiresAt,
          priceSnapshot: {
            pricePerHourPaise: charger.pricePerHourPaise,
            chargerCode: charger.chargerCode,
            connectorType: charger.connectorType,
            powerKw: charger.powerKw,
          },
          stationSnapshot: {
            name: station.name,
            address: station.address,
            city: station.city,
            timeZone: station.timeZone,
          },
          vehicleSnapshot: {
            registrationNumber: vehicle.registrationNumber,
            manufacturer: vehicle.manufacturer,
            model: vehicle.model,
          },
        },
      ],
      { session },
    );
    return booking;
  });
}
export async function pay(userId, id, outcome, key) {
  return transaction(async (session) => {
    const booking = await Booking.findOne({ _id: id, userId }).session(session);
    if (!booking) fail(404, 'Booking not found.');
    const existing = await Payment.findOne({ bookingId: id, idempotencyKey: key }).session(session);
    if (existing) return { booking, payment: existing };
    const success = await Payment.findOne({ bookingId: id, status: 'success' }).session(session);
    if (success) return { booking, payment: success };
    const now = new Date();
    if (booking.status !== 'pending_payment' || booking.holdExpiresAt <= now)
      fail(409, 'Payment hold expired or booking cannot be paid.');
    const [payment] = await Payment.create(
      [
        {
          bookingId: id,
          transactionReference: `SIM-${randomUUID()}`,
          amountPaise: booking.amountPaise,
          status: outcome,
          idempotencyKey: key,
          processedAt: now,
        },
      ],
      { session },
    );
    if (outcome === 'success') {
      const claimed = await Block.updateMany(
        { bookingId: id, state: 'hold', holdExpiresAt: { $gt: now } },
        { $set: { state: 'confirmed' }, $unset: { holdExpiresAt: 1 } },
      ).session(session);
      if (!claimed.modifiedCount) fail(409, 'Reservation hold is unavailable.');
      booking.status = 'confirmed';
      await booking.save({ session });
      await notify(
        booking,
        'confirmed',
        `Booking ${booking.bookingReference} confirmed (simulated payment).`,
        session,
      );
    }
    return { booking, payment };
  });
}
export async function cancel(userId, id, reason) {
  return transaction(async (session) => {
    const booking = await Booking.findOne({ _id: id, userId }).session(session);
    if (!booking) fail(404, 'Booking not found.');
    if (booking.status === 'cancelled') return booking;
    if (!['confirmed', 'pending_payment'].includes(booking.status) || booking.startAt <= new Date())
      fail(409, 'Only reservations that have not started can be cancelled.');
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancellationReason = reason;
    await booking.save({ session });
    await Block.deleteMany({ bookingId: id }).session(session);
    const payment = await Payment.findOne({ bookingId: id, status: 'success' }).session(session);
    if (payment)
      await Refund.create(
        [
          {
            bookingId: id,
            paymentId: payment._id,
            refundReference: `REF-${randomUUID()}`,
            amountPaise: booking.amountPaise,
            processedAt: new Date(),
          },
        ],
        { session },
      );
    await notify(
      booking,
      'cancelled',
      `Booking ${booking.bookingReference} cancelled${payment ? '; full simulated refund issued' : ''}.`,
      session,
    );
    return booking;
  });
}
export async function expireHolds() {
  const now = new Date();
  await Booking.updateMany(
    { status: 'pending_payment', holdExpiresAt: { $lte: now } },
    { $set: { status: 'expired' } },
  );
  await Block.deleteMany({ state: 'hold', holdExpiresAt: { $lte: now } });
}
