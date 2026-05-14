import { Router } from "express";
import * as adminController from "../controllers/adminController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

// All admin routes require ADMIN role
router.use(authenticate, authorize("ADMIN"));

router.get("/users",              adminController.listUsers);
router.patch("/users/:id/toggle", adminController.toggleUserActive);
router.get("/food-bags",          adminController.listAllFoodBags);
router.get("/queue/stats",        adminController.getQueueStats);

export default router;