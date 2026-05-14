import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  DECAY_INTERVAL_MINUTES: z.string().default("15"),
  DECAY_PERCENTAGE: z.string().default("10"),
  MIN_FOOD_PRICE_CENTS: z.string().default("50000"),
  AUCTION_TRIGGER_MINUTES: z.string().default("30"),

  CORS_ORIGIN: z.string().default("http://localhost:3001"),

  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  APP_URL: z.string().default("http://localhost:3000"),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.string().default("6379"),
  REDIS_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(" Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn: parsed.data.JWT_ACCESS_EXPIRES_IN,
  jwtRefreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN,
  decayIntervalMinutes: parseInt(parsed.data.DECAY_INTERVAL_MINUTES, 10),
  decayPercentage: parseInt(parsed.data.DECAY_PERCENTAGE, 10),
  minFoodPriceCents: parseInt(parsed.data.MIN_FOOD_PRICE_CENTS, 10),
  auctionTriggerMinutes: parseInt(parsed.data.AUCTION_TRIGGER_MINUTES, 10),
  corsOrigin: parsed.data.CORS_ORIGIN,
  RESEND_API_KEY: parsed.data.RESEND_API_KEY,
  APP_URL: parsed.data.APP_URL,
  REDIS_HOST: parsed.data.REDIS_HOST,
  REDIS_PORT: parseInt(parsed.data.REDIS_PORT, 10),
  REDIS_PASSWORD: parsed.data.REDIS_PASSWORD,
} as const;