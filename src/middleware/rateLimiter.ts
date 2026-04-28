import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { AppError } from "../utils/errors";

interface RateLimitOptions {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix?: string;
}

export function rateLimiter(options: RateLimitOptions) {
  const { maxRequests, windowSeconds, keyPrefix = "rl" } = options;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    const key = `${keyPrefix}:${ip}`;

    try {
      const multi = redis.multi();
      multi.incr(key);
      multi.expire(key, windowSeconds);
      const results = await multi.exec();

      if (!results) {
        // Redis unavailable — fail open
        return next();
      }

      const count = results[0][1] as number;

      if (count > maxRequests) {
        throw new AppError(
          `Too many requests. Max ${maxRequests} per ${windowSeconds}s. Try again later.`,
          429
        );
      }

      next();
    } catch (err) {
      if (err instanceof AppError) {
        return next(err);
      }
      // Redis error — fail open
      next();
    }
  };
}

// Auth-specific: 5 attempts per 60 seconds per IP
export const authRateLimiter = rateLimiter({
  maxRequests: 5,
  windowSeconds: 60,
  keyPrefix: "rl:auth",
});
