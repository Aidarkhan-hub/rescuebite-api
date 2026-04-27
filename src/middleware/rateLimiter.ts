import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';

export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip;
  const key = `rate-limit:${ip}`;
  
  const requests = await redis.incr(key);
  
  if (requests === 1) {
    await redis.expire(key, 60); // 1 минутқа блок
  }

  if (requests > 5) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  }
  next();
};