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
  role: z.enum(["RECIPIENT", "DONOR"]).optional(), // ADMIN cannot self-register
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one digit"),
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);
  const result = await AuthService.register({
    email: body.email,
    name: body.name,
    password: body.password,
    role: body.role as Role | undefined,
  });
  res.status(201).json({ success: true, data: result });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) throw new BadRequestError("token query param is required");
  const result = await AuthService.verifyEmail(token);
  res.status(200).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const result = await AuthService.login({ email: body.email, password: body.password });
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

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = forgotPasswordSchema.parse(req.body);
  const result = await AuthService.forgotPassword(body.email);
  res.status(200).json({ success: true, data: result });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = resetPasswordSchema.parse(req.body);
  const result = await AuthService.resetPassword(body.token, body.newPassword);
  res.status(200).json({ success: true, data: result });
});