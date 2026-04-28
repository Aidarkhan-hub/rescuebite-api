# RescueBite Backend 🥡

Real-time food waste recovery marketplace for Almaty restaurants.
Built with **Node.js + Express + Prisma 5 + PostgreSQL + Redis + TypeScript**.

---

##  Quick Start (Docker)

### 1. Prerequisites
- Docker Desktop (running)
- Node.js 20+

### 2. Clone & configure
```bash
git clone <repo-url>
cd rescuebite-backend
cp .env.example .env
```

Open `.env` — the default values already match `docker-compose.yml`. No changes needed for local dev.

### 3. Start infrastructure
```bash
docker compose up -d
```

Check containers are healthy:
```bash
docker compose ps
# postgres: healthy, redis: healthy
```

**Fix for P1000 Auth error:** Make sure `.env` `DATABASE_URL` matches docker-compose credentials exactly:
```
DATABASE_URL="postgresql://rescuebite:rescuebite_secret@localhost:5432/rescuebite"
```

### 4. Install dependencies & run migrations
```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
```

### 5. Start the API server
```bash
npm run dev
```

API: `http://localhost:3000`
Swagger UI: `http://localhost:3000/docs`
Health: `http://localhost:3000/health`

---

##  Tests

```bash
npm test                  # all tests
npm run test:coverage     # with coverage report
```

Unit tests run **without** DB/Redis. Integration tests require running containers.

---

##  Project Structure

```
src/
├── config/        # env validation, Prisma singleton, Redis client
├── controllers/   # HTTP req/res handlers (no business logic)
├── middleware/     # JWT auth, RBAC, rate limiter, error handler
├── routes/        # URL definitions
├── services/      # Business logic (auth, allergens, state machine, reservations)
├── workers/       # Cron jobs (decay worker every 15 min)
└── utils/         # asyncHandler, custom errors
prisma/
├── schema.prisma  # Single source of truth for DB schema
tests/
├── unit/          # Pure function tests (no DB/Redis)
└── integration/   # Endpoint tests (requires running Docker)
```

---

##  Auth Flow

```
POST /api/v1/auth/register  → { user, tokens: { accessToken, refreshToken } }
POST /api/v1/auth/login     → { user, tokens }
POST /api/v1/auth/refresh   → { tokens }
POST /api/v1/auth/logout    → 200 OK  (Bearer token required)
GET  /api/v1/auth/me        → { id, email, role }
```

- Access token: 15-minute expiry
- Refresh token: 7-day expiry, stored as bcrypt hash in DB
- Rate limiting: 5 attempts/min per IP on register + login

---

##  Food Bag State Machine

```
FRESH → DISCOUNTED → FREE → COMPOST
  └──────────────────────────┘
        (any → COMPOST)
```

Decay worker runs every 15 minutes:
- Applies `-10%` price decay to FRESH/DISCOUNTED bags
- Floor: 50,000 cents (configurable via `MIN_FOOD_PRICE_CENTS`)
- Within 30 min of deadline → status becomes FREE
- Past deadline → COMPOST

---

##  EU 14 Allergens

`POST /api/v1/food/allergens/parse`
```json
{
  "ingredients": ["wheat flour", "egg", "milk"],
  "userAllergens": ["GLUTEN", "DAIRY"]
}
```
Returns detected allergens, safety flag, and per-ingredient breakdown.

---

##  Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `REDIS_URL` | Redis connection string | required |
| `JWT_ACCESS_SECRET` | Min 32 chars | required |
| `JWT_REFRESH_SECRET` | Min 32 chars | required |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `DECAY_INTERVAL_MINUTES` | Cron interval | `15` |
| `DECAY_PERCENTAGE` | % price drop per interval | `10` |
| `MIN_FOOD_PRICE_CENTS` | Price floor in cents | `50000` |
| `AUCTION_TRIGGER_MINUTES` | Minutes before deadline for FREE | `30` |

---

##  Architecture Notes

- **Zero raw SQL** — all DB access via Prisma ORM
- **Money in INTEGER cents** — no float arithmetic
- **Redis distributed lock** during checkout prevents overselling
- **Sliding window rate limiter** — Redis INCR + EXPIRE
- **RBAC** — roles: `RECIPIENT`, `DONOR`, `ADMIN`
- See `ARCHITECTURE.md` for detailed design decisions
