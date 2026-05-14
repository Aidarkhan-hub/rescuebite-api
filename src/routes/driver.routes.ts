import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as driverController from "../controllers/driverController";

const router = Router();

// All routes require DRIVER role
router.use(authenticate, authorize("DRIVER"));

router.get("/orders", driverController.listAvailableOrders);
router.patch("/orders/:id/accept", driverController.acceptOrder);
router.post("/orders/:id/location", driverController.updateLocation);
router.get("/history", driverController.getHistory);

export default router;