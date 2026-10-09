import { z } from 'zod';
import { IANAZone } from 'luxon';
const text = z.string().trim().min(1).max(200);
export const id = z.string().regex(/^[a-f\d]{24}$/i);
export const connector = z.enum(['CCS2', 'Type 2', 'CHAdeMO', 'Bharat AC']);
export const register = z.object({
  name: text,
  email: z.email().transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d ()-]{7,20}$/),
  password: z.string().min(10).max(128),
});
export const profile = register.pick({ name: true, phone: true });
export const vehicle = z.object({
  registrationNumber: text,
  manufacturer: text,
  model: text,
  vehicleType: z.enum(['car', 'bike', 'van', 'bus']),
  connectorType: connector,
  batteryCapacityKwh: z.number().positive().max(2000).optional(),
  isActive: z.boolean().optional(),
});
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const station = z.object({
  name: text,
  description: z.string().max(2000),
  address: text,
  city: text,
  state: text,
  postalCode: text,
  location: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  }),
  timeZone: z.string().refine((v) => IANAZone.isValidZone(v)),
  contactPhone: text,
  openingHours: z
    .object({ open: time, close: time })
    .refine(
      (v) => v.open < v.close,
      'Closing time must follow opening time; overnight hours are not supported.',
    ),
  status: z.enum(['active', 'inactive']).optional(),
  imageUrl: z.union([z.url(), z.literal('')]).optional(),
});
export const charger = z.object({
  chargerCode: text,
  connectorType: connector,
  powerKw: z.number().positive().max(2000),
  pricePerHourPaise: z.number().int().positive().max(10000000),
  operationalStatus: z.enum(['active', 'maintenance', 'inactive']).optional(),
});
export const reservation = z.object({
  chargerId: id,
  vehicleId: id,
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
});
export function parse(schema, data) {
  return schema.parse(data);
}
export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
