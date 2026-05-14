Получить бесплатный ключ на [resend.com](https://resend.com).

### 4. Применить миграции

```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Запустить сервер

```bash
npm run dev
```

- API: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`

---

## Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL строка подключения |
| `REDIS_URL` | ✅ | Redis строка подключения |
| `REDIS_HOST` | ✅ | Redis хост (для BullMQ) |
| `REDIS_PORT` | ✅ | Redis порт (для BullMQ) |
| `JWT_ACCESS_SECRET` | ✅ | Минимум 32 символа |
| `JWT_REFRESH_SECRET` | ✅ | Минимум 32 символа |
| `RESEND_API_KEY` | ✅ | С resend.com |
| `APP_URL` | — | База для ссылок в письмах. По умолчанию `http://localhost:3000` |
| `JWT_ACCESS_EXPIRES_IN` | — | По умолчанию `15m` |
| `JWT_REFRESH_EXPIRES_IN` | — | По умолчанию `7d` |
| `DECAY_INTERVAL_MINUTES` | — | По умолчанию `15` |
| `DECAY_PERCENTAGE` | — | По умолчанию `10` |
| `MIN_FOOD_PRICE_CENTS` | — | По умолчанию `50000` (500 KZT) |
| `AUCTION_TRIGGER_MINUTES` | — | По умолчанию `30` |

---

## Тестирование через Postman

### Шаг 1 — Регистрация

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "donor@test.com",
  "name": "Test Donor",
  "password": "Test1234!"
}
```

### Шаг 2 — Подтверждение email

Получить токен из БД:

```sql
SELECT "emailVerificationToken" FROM users WHERE email = 'donor@test.com';
```

```http
GET /api/v1/auth/verify-email?token=<token>
```

### Шаг 3 — Логин

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "donor@test.com",
  "password": "Test1234!"
}
```

Сохранить `accessToken` и `refreshToken` из ответа.

### Шаг 4 — Создать food bag (роль DONOR)

```http
POST /api/v1/food
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "title": "Sushi Combo Box",
  "description": "6 роллов, истекает сегодня вечером",
  "originalPriceCents": 250000,
  "quantity": 3,
  "pickupDeadline": "2027-06-30T20:00:00Z",
  "allergens": ["FISH"]
}
```

### Шаг 5 — Забронировать пакет (роль RECIPIENT)

```http
POST /api/v1/food/<bagId>/reserve
Authorization: Bearer <recipientToken>
Content-Type: application/json

{
  "quantity": 1
}
```

### Шаг 6 — Отменить бронь

```http
DELETE /api/v1/food/reservations/<reservationId>
Authorization: Bearer <recipientToken>
```

### Шаг 7 — Обновить токен

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

### Admin эндпоинты (только роль ADMIN)

```http
GET    /api/v1/admin/users
PATCH  /api/v1/admin/users/:id/toggle-active
GET    /api/v1/admin/food-bags
GET    /api/v1/admin/queue-stats
```

---

## Архитектурные решения

### Деньги хранятся в целых числах (cents)

Все цены хранятся как `INT` в тийынах (1 KZT = 100 тийын, т.е. 1000 KZT = 100000). Арифметика с плавающей точкой ненадёжна: `0.1 + 0.2 = 0.30000000000000004` в IEEE 754. Целочисленная арифметика точна и не накапливает ошибок.

### Refresh токены хранятся хэшированными

В БД никогда не хранится сам токен — только его bcrypt-хэш в `users.refreshTokenHash`. При утечке базы данных хэши нельзя использовать напрямую для вызова `/refresh`, потому что bcrypt — односторонняя функция. При каждом использовании токен ротируется и старый хэш перезаписывается.

### Redis distributed lock для резервирования

`SET key requestId EX 30 NX` — атомарная операция на уровне Redis. `NX` означает "установить только если ключ не существует" — два конкурентных запроса не могут оба получить `OK`. `EX 30` — TTL на случай краша процесса, чтобы лок не висел вечно. Это исключает oversell когда несколько пользователей одновременно берут последний пакет.

### State machine в TypeScript, не в SQL триггерах

Переходы `FRESH → DISCOUNTED → FREE → COMPOST` описаны в `src/services/foodStateMachine.ts`. Логика на уровне приложения легче тестируется (чистые функции без side-effects), проще ревьюится и не привязана к конкретной БД. SQL триггеры невидимы при code review.

### BullMQ для отправки email

Отправка email вынесена в фоновую очередь. API отвечает немедленно, не дожидаясь ответа от Resend. Если Resend временно недоступен — BullMQ автоматически повторяет job. Медленная или упавшая почта не влияет на latency API.

### Cursor pagination вместо offset

`OFFSET 10000 LIMIT 20` требует просканировать и выбросить 10 000 строк. Cursor pagination (`WHERE id > cursor LIMIT 20`) использует индекс и работает за O(1) независимо от размера таблицы. Также стабилен при параллельных вставках — offset пропускает строки если новые записи добавляются перед курсором.

### Prisma ORM без raw SQL

Все запросы через Prisma — нет SQL injection по определению, схема типобезопасна на уровне TypeScript, миграции версионируются в git. Raw SQL запрещён в кодовой базе.

---

## Фоновые задачи

### Decay Worker (`src/workers/decayWorker.ts`)

Запускается каждые 15 минут (настраивается через `DECAY_INTERVAL_MINUTES`). Для каждого активного food bag:

1. Если дедлайн прошёл → статус `COMPOST`, цена = 0
2. Если до дедлайна осталось меньше `AUCTION_TRIGGER_MINUTES` → статус `FREE`, цена = 0
3. Иначе → снизить цену на `DECAY_PERCENTAGE`%, минимум `MIN_FOOD_PRICE_CENTS`

### Email Worker (`src/config/queue.ts`)

BullMQ воркер обрабатывает очередь `email`. События:

| Тип | Триггер |
|---|---|
| `verify-email` | Регистрация |
| `password-reset` | Запрос сброса пароля |
| `reservation-confirmed` | Успешное бронирование |
| `reservation-cancelled` | Отмена брони |

---

## Запуск тестов

```bash
# Все тесты
npm test

# С отчётом покрытия
npm run test:coverage

# Один файл
npx jest tests/integration/reservation.test.ts
```

Тесты мокают email очередь и BullMQ воркер. Требуется запущенный PostgreSQL (предоставляется docker-compose).

**Результат:** 7 тест-сьютов, 55 тестов, 0 упавших.

---

## Структура проекта