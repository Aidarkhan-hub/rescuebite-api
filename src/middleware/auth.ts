import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  type: "access" | "refresh";
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Missing or invalid Authorization header"));
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.jwtAccessSecret) as JwtPayload;

    if (payload.type !== "access") {
      return next(new UnauthorizedError("Invalid token type"));
    }

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError("Token expired"));
    }
    return next(new UnauthorizedError("Invalid token"));
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Not authenticated"));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Role '${req.user.role}' is not authorized. Required: ${roles.join(", ")}`
        )
      );
    }

    next();
  };
}
