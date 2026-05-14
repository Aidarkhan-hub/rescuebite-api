import { Router } from "express";
import * as authController from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import { authRateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.post("/register",        authRateLimiter, authController.register);
router.get("/verify-email",     authController.verifyEmail);          // link from email
router.post("/login",           authRateLimiter, authController.login);
router.post("/refresh",         authController.refresh);
router.post("/logout",          authenticate,    authController.logout);
router.get("/me",               authenticate,    authController.me);
router.post("/forgot-password", authRateLimiter, authController.forgotPassword);
router.post("/reset-password",  authRateLimiter, authController.resetPassword);

export default router;