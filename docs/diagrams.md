# Software Engineering diagrams

Mermaid source is rendered by GitHub. The payment actor is an internal Dummy Payment Service, never an external gateway.

## Use cases

```mermaid
flowchart LR
 Guest --> Search[Search stations and view maps/reviews]
 Guest --> Register[Register or log in]
 Customer --> Search
 Customer --> Vehicle[Manage profile and vehicles]
 Customer --> Book[Reserve a charging period]
 Customer --> Pay[Simulate payment]
 Customer --> Cancel[Cancel and simulate refund]
 Customer --> Review[Review completed booking]
 Admin --> Manage[Manage stations and chargers]
 Admin --> Users[Activate/deactivate customers]
 Admin --> Session[Start and complete sessions]
 Admin --> Reports[Inspect reports and export CSV]
```

## Booking activity

```mermaid
flowchart TD
 A[Search station] --> B[Select charger and owned compatible vehicle]
 B --> C[Select future aligned time blocks]
 C --> D{All blocks claimable?}
 D -->|No| C
 D -->|Yes| E[Transaction creates five-minute hold]
 E --> F[Review summary]
 F --> G{Dummy payment result}
 G -->|Failure| H{Hold valid?}
 H -->|Yes| F
 H -->|No| X[Expire reservation]
 G -->|Success and valid hold| I[Confirm booking atomically]
 I --> J[Admin starts then completes session]
 J --> K[Customer submits one review]
 F -->|Cancel| L[Release blocks]
 I -->|Cancel before start| M[Release blocks and simulate full refund]
```

## Swimlanes

```mermaid
flowchart LR
 subgraph Customer
 A[Choose station and slot] --> B[Request reservation]
 C[Review booking] --> D[Simulate success]
 end
 subgraph Express
 E[Authenticate and validate] --> F[Booking Service]
 G[Dummy Payment Service] --> H[Return confirmation]
 end
 subgraph MongoDB
 I[Claim blocks and save pending booking]
 J[Save payment, confirm blocks and notify]
 end
 B --> E
 F --> I --> C
 D --> G --> J --> H
```

## Login sequence

```mermaid
sequenceDiagram
 actor Customer
 participant Browser
 participant Auth as Authentication API
 participant DB as MongoDB
 Customer->>Browser: Enter email/password
 Browser->>Auth: GET CSRF token
 Browser->>Auth: POST login with cookie and CSRF
 Auth->>DB: Load active user and password hash
 Auth->>Auth: Verify bcrypt and regenerate session
 Auth->>DB: Save server-side session
 Auth-->>Browser: Safe user, new CSRF and session cookie
```

## Reservation sequence

```mermaid
sequenceDiagram
 actor Customer
 participant Browser
 participant Service as Booking Service
 participant DB as MongoDB replica set
 Customer->>Browser: Choose charger, vehicle and times
 Browser->>Service: POST booking (no authoritative price)
 Service->>DB: Begin transaction
 Service->>DB: Validate owner, connector and operational records
 Service->>Service: Validate time zone/hours; calculate price
 Service->>DB: Remove expired requested claims
 Service->>DB: Insert all uniquely indexed blocks
 alt Any block conflicts
 DB-->>Service: Duplicate claim
 Service->>DB: Abort transaction
 Service-->>Browser: 409 choose another slot
 else All claims succeed
 Service->>DB: Save booking and snapshots; commit
 Service-->>Browser: Saved reference and hold expiry
 end
```

## Dummy payment sequence

```mermaid
sequenceDiagram
 participant Browser
 participant Dummy as Dummy Payment Service
 participant DB as MongoDB
 Browser->>Dummy: outcome + idempotency key
 Dummy->>DB: Begin transaction; load owned booking
 Dummy->>DB: Check existing key/successful payment
 alt Existing result
 Dummy-->>Browser: Return saved result
 else Valid pending hold
 Dummy->>DB: Record simulated payment
 alt Success
 Dummy->>DB: Confirm booking/blocks and add notifications
 else Failed
 Dummy->>DB: Retain pending hold
 end
 Dummy->>DB: Commit
 Dummy-->>Browser: Saved payment and booking
 else Expired or invalid
 Dummy-->>Browser: Reject with 409
 end
```

## Class and collection relationships

```mermaid
classDiagram
 User "1" --> "many" Vehicle : owns
 User "1" --> "many" Booking : reserves
 Station "1" --> "many" Charger : contains
 Charger "1" --> "many" Booking : scheduled for
 Vehicle "1" --> "many" Booking : used by
 Booking "1" --> "many" ReservationBlock : claims
 Booking "1" --> "many" Payment : attempts
 Booking "1" --> "0..1" Refund : receives
 Booking "1" --> "0..1" Review : evaluated by
 User "1" --> "many" Notification : receives
 class Booking {
  ObjectId userId
  Date startAt
  Date endAt
  string status
  int amountPaise
  Date holdExpiresAt
  reserve()
  cancel()
 }
 class ReservationBlock {
  ObjectId chargerId
  Date blockStartAt
  string state
 }
 class Payment {
  string idempotencyKey
  string status
  string mode_simulated
  simulate()
 }
```

## Context diagram

```mermaid
flowchart LR
 Customer -->|Search, booking, demo payment, review| System[Voltway]
 System -->|Stations, confirmation, history, notifications| Customer
 Admin -->|Operational data and permitted transitions| System
 System -->|Bookings, reports and simulated totals| Admin
 Tiles[Map tile provider] -->|Attributed map tiles| System
```

## Level-0 DFD

```mermaid
flowchart LR
 Driver[Customer] --> Auth[1. Authentication]
 Driver --> Search[2. Station search]
 Driver --> Booking[3. Reservations]
 Driver --> Payment[4. Dummy payments/refunds]
 Admin --> Manage[5. Administration]
 Auth <--> Users[(Users and sessions)]
 Search <--> Stations[(Stations and chargers)]
 Booking <--> Records[(Bookings and reservation blocks)]
 Payment <--> Finance[(Simulated payments and refunds)]
 Manage <--> Stations
 Manage <--> Records
 Manage --> Reports[6. Reporting]
 Finance --> Reports
 Records --> Reports
 Reports --> Admin
```

## Level-1 reservation DFD

```mermaid
flowchart LR
 Customer --> Validate[3.1 Validate identity, vehicle and schedule]
 Vehicles[(Vehicles)] --> Validate
 Stations[(Stations and chargers)] --> Validate
 Validate --> Claim[3.2 Atomically claim time blocks]
 Blocks[(Reservation blocks)] <--> Claim
 Claim --> Save[3.3 Save hold and price snapshots]
 Save --> Bookings[(Bookings)]
 Bookings --> Summary[3.4 Return saved summary]
 Summary --> Customer
 Bookings --> Expiry[3.5 Expire elapsed holds]
 Expiry --> Blocks
 Expiry --> Bookings
```
