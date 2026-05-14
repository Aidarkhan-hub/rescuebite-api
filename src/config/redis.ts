import Redis from "ioredis";
import { env } from "./env";

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on("connect", () => {
  if (env.nodeEnv !== "test") console.log("Redis connected");
});

redis.on("error", (err) => {
  console.error(" Redis error:", err.message);
});

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
