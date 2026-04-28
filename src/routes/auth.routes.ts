import { Router } from "express";
import * as authController from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import { rateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.post("/register", rateLimiter, authController.register);
router.post("/login", rateLimiter, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.me);

export default router;
