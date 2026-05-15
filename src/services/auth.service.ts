import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { Role } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
} from "../utils/errors";
import {
  enqueueVerificationEmail,
  enqueuePasswordResetEmail,
} from "../config/queue";

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
  // ─── Register ──────────────────────────────────────────────────────────────
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

    // Generate a plain token to send in email, store its hash in DB
    const verificationToken = uuidv4();
    const emailVerificationToken = await bcrypt.hash(verificationToken, 10);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name.trim(),
        passwordHash,
        role: (input.role as Role) ?? Role.RECIPIENT,
        isEmailVerified: false,
        emailVerificationToken,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    // Enqueue email asynchronously — API does not block waiting for Resend
    await enqueueVerificationEmail({
      to: user.email,
      name: user.name,
      token: verificationToken,
    });

    return {
      user,
      message: "Registration successful. Please check your email to verify your account.",
    };
  }

  // ─── Verify Email ──────────────────────────────────────────────────────────
  static async verifyEmail(token: string) {
    // We must find the user whose stored hash matches this token.
    // bcrypt.compare is O(n_users) — acceptable for now; at scale use a lookup index.
    const users = await prisma.user.findMany({
      where: { isEmailVerified: false, emailVerificationToken: { not: null } },
      select: { id: true, emailVerificationToken: true },
    });

    let matchedUserId: string | null = null;
    for (const u of users) {
      if (u.emailVerificationToken && await bcrypt.compare(token, u.emailVerificationToken)) {
        matchedUserId = u.id;
        break;
      }
    }

    if (!matchedUserId) throw new BadRequestError("Invalid or expired verification token");

    await prisma.user.update({
      where: { id: matchedUserId },
      data: { isEmailVerified: true, emailVerificationToken: null },
    });

    return { message: "Email verified successfully. You can now log in." };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────
  static async login(input: { email: string; password: string }) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user || !user.isActive) throw new UnauthorizedError("Invalid credentials");

    // Block unverified users
    if (!user.isEmailVerified) {
      throw new UnauthorizedError("Please verify your email before logging in");
    }

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

  // ─── Refresh Tokens ────────────────────────────────────────────────────────
  static async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
    if (payload.type !== "refresh") throw new UnauthorizedError("Invalid token type");

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || !user.refreshTokenHash)
      throw new UnauthorizedError("Session revoked");

    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedError("Refresh token mismatch");

    const newAccessToken = generateAccessToken(user.id, user.email, user.role);
    const newRefreshToken = generateRefreshToken(user.id, user.email, user.role);
    const newHash = await bcrypt.hash(newRefreshToken, 10);
    await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: newHash } });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  // ─── Logout ────────────────────────────────────────────────────────────────
  static async logout(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");
    await prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
  }

  // ─── Forgot Password ───────────────────────────────────────────────────────
  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success — don't reveal whether email exists (security)
    if (!user || !user.isActive) {
      return { message: "If that email is registered, a reset link has been sent." };
    }

    const resetToken = uuidv4();
    const passwordResetToken = await bcrypt.hash(resetToken, 10);
    const passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken, passwordResetExpiresAt },
    });

    await enqueuePasswordResetEmail({
      to: user.email,
      name: user.name,
      token: resetToken,
    });

    return { message: "If that email is registered, a reset link has been sent." };
  }

  // ─── Reset Password ────────────────────────────────────────────────────────
  static async resetPassword(token: string, newPassword: string) {
    if (newPassword.length < 8)
      throw new BadRequestError("Password must be at least 8 characters");

    const users = await prisma.user.findMany({
      where: {
        passwordResetToken: { not: null },
        passwordResetExpiresAt: { gt: new Date() }, // not expired
      },
      select: { id: true, passwordResetToken: true },
    });

    let matchedUserId: string | null = null;
    for (const u of users) {
      if (u.passwordResetToken && await bcrypt.compare(token, u.passwordResetToken)) {
        matchedUserId = u.id;
        break;
      }
    }

    if (!matchedUserId) throw new BadRequestError("Invalid or expired reset token");

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: matchedUserId },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        refreshTokenHash: null, // invalidate all sessions after password change
      },
    });

    return { message: "Password reset successfully. Please log in with your new password." };
  }
}
