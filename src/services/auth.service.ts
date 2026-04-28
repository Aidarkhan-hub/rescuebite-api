import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { ConflictError, UnauthorizedError, NotFoundError, BadRequestError } from "../utils/errors";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  type: "access" | "refresh";
}

function generateAccessToken(sub: string, email: string, role: Role): string {
  return jwt.sign(
    { sub, email, role, type: "access" },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpiresIn as any }
  );
}

function generateRefreshToken(sub: string, email: string, role: Role): string {
  return jwt.sign(
    { sub, email, role, type: "refresh" },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshExpiresIn as any }
  );
}

export class AuthService {
  static async register(input: {
    email: string;
    name: string;
    password: string;
    role?: Role;
  }) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) throw new ConflictError("Email already registered");
    if (input.password.length < 8)
      throw new BadRequestError("Password must be at least 8 characters");

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name.trim(),
        passwordHash,
        role: input.role ?? Role.RECIPIENT,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id, user.email, user.role);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return { user, tokens: { accessToken, refreshToken } };
  }

  static async login(input: { email: string; password: string }) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user || !user.isActive) throw new UnauthorizedError("Invalid credentials");

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError("Invalid credentials");

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id, user.email, user.role);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tokens: { accessToken, refreshToken },
    };
  }

  static async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
    if (payload.type !== "refresh")
      throw new UnauthorizedError("Invalid token type");

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || !user.refreshTokenHash)
      throw new UnauthorizedError("Session revoked");

    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedError("Refresh token mismatch");

    const newAccessToken = generateAccessToken(user.id, user.email, user.role);
    const newRefreshToken = generateRefreshToken(user.id, user.email, user.role);
    const newHash = await bcrypt.hash(newRefreshToken, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: newHash },
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  static async logout(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }
}