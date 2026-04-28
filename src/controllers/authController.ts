import { Request, Response } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { AuthService } from "../services/auth.service";
import { asyncHandler } from "../utils/asyncHandler";
import { BadRequestError } from "../utils/errors";

const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 chars").max(120),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit"),
  role: z.enum(["RECIPIENT", "DONOR", "ADMIN"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);
  const result = await AuthService.register({
    ...body,
    role: body.role as Role | undefined,
  });
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const result = await AuthService.login(body);
  res.status(200).json({ success: true, data: result });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const body = refreshSchema.parse(req.body);
  const tokens = await AuthService.refreshTokens(body.refreshToken);
  res.status(200).json({ success: true, data: { tokens } });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new BadRequestError("Not authenticated");
  await AuthService.logout(req.user.sub);
  res.status(200).json({ success: true, message: "Logged out successfully" });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: { id: req.user!.sub, email: req.user!.email, role: req.user!.role },
  });
});
