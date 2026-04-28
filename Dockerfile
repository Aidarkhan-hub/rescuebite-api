FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY openapi.yaml ./

RUN npx prisma generate
RUN npm run build

# ── Production image ──────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -S rescuebite && adduser -S rescuebite -G rescuebite

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/openapi.yaml ./openapi.yaml
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER rescuebite

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
