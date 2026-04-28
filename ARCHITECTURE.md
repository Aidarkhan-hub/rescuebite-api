# RescueBite — Architecture Decisions

## Money Representation
All monetary values are stored as **INTEGER cents** (e.g., 1000 KZT = 100000 cents).
This avoids floating-point precision bugs in price decay calculations.

## Price Decay Strategy
Decay is calculated in **application logic** (not PostgreSQL triggers) via `applyDecay()` in `src/services/foodStateMachine.ts`.
Rationale: Application-level logic is easier to unit test, audit, and change without DB migrations.

## Auth Token Storage
Refresh tokens are **never stored in plaintext**. Only a bcrypt hash is stored in `users.refreshTokenHash`.
On logout, the hash is set to `null`, immediately invalidating the session.

## Redis Lock for Checkout
`src/services/reservationService.ts` uses Redis `SET ... NX EX` to acquire a distributed lock per `food_bag_id`.
This prevents two simultaneous purchases from overselling a bag with `quantity=1`.

## Rate Limiting
Redis-based sliding window (INCR + EXPIRE per key) rather than in-memory, so it works across multiple server instances.
Limit: 5 requests/min per IP on `/auth/register` and `/auth/login`.

## Geospatial
`lat`/`lng` are not in the current schema (deferred to v2). Haversine distance calculation is documented in the blueprint and will be added when driver GPS tracking is implemented.

## Cursor Pagination
All list endpoints use cursor-based pagination (`?cursor=<uuid>&limit=20`) rather than offset pagination.
This is stable under concurrent inserts and scales with large datasets.
