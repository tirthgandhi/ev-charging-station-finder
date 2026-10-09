# Implementation parts

1. Foundation: Express, MongoDB models and indexes, configuration, sessions, CSRF, authentication and authorization.
2. Station operations: admin station/charger management, public search, time-zone aware availability.
3. Reservation engine: atomic block claims, expiring holds, price snapshots, idempotent dummy payments and refunds.
4. Customer services: vehicles, profile, booking history, eligible reviews and notifications.
5. Admin services: permitted booking transitions, customer status, dashboard, filtered reports and CSV.
6. Interface and verification: dark/orange liquid-glass responsive interface connected to completed APIs, maps, automated integration tests and documentation.

Backend is implemented before the corresponding user interface. MongoDB must support transactions (Atlas or a local replica set). No real payment credentials are collected.
