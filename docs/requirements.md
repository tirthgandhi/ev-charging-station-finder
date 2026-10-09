# Requirements

## Problem and objectives

EV drivers need a way to locate compatible stations and reserve charging time before arrival. Voltway combines searchable, admin-maintained station information with reservation availability, saved vehicles and a demonstrable payment workflow. The AWT/SE project focuses on consistency, security and a complete customer/admin journey.

## Actors and functionality

Guests search stations, view maps, details and public reviews, and register/login. Customers manage their profile and vehicles, reserve compatible chargers, simulate payments, inspect history, cancel eligible sessions, read notifications and review completed bookings. Admins maintain stations/chargers, activate/deactivate customers, advance sessions, inspect payments/refunds and export filtered reports. No public form can create an admin.

## Non-functional requirements

- Concurrent overlapping requests must never claim the same charger block.
- Private records are restricted by the backend to their owner; admin routes require an active admin.
- MongoDB persists application records and sessions across application restarts.
- No passwords, connection strings or session secrets are exposed in browser code.
- User content is escaped before HTML insertion. Forms are labelled and layouts adapt to mobile.
- Empty, loading and error states provide recovery routes.
- All simulated financial operations are labelled; no card, bank or UPI credentials are requested.

## Scope and limitations

The system measures reservations, not real charger occupancy or energy. Admins manage operational status. Maps show only database records, not an external charger directory. The built-in schedule is one daily window without overnight sessions, holidays or per-weekday schedules. Address search matches stored text without external geocoding. Transactions require Atlas or a replica set. Reports currently load matching data in memory; add pagination/aggregation before very large deployments. Notifications are in-app only. Station artwork is illustrative.

## Acceptance demonstration

Create a station/charger as admin; register a customer; add a matching vehicle; find the station; choose future availability; reserve and simulate success; retrieve the saved confirmation; start and complete the session as admin; submit a customer review; filter and export the report. Also demonstrate conflict rejection, failed payment followed by retry, hold expiry and cancellation with one simulated refund.
