import { Router } from "express";
import * as foodController from "../controllers/foodController";
import { authenticate, authorize } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

// POST /api/v1/food/allergens/parse — static, должен быть выше /:id
router.post("/allergens/parse", foodController.parseAllergensHandler);

// DELETE /api/v1/food/reservations/:reservationId — static prefix, выше /:id
router.delete(
  "/reservations/:reservationId",
  authenticate,
  foodController.cancelReservation
);

// GET /api/v1/food — public (token optional для персонализации аллергенов)
router.get("/", (req, res, next) => {
  if (req.headers.authorization) {
    authenticate(req, res, (err) => { if (err) return next(); next(); });
  } else {
    next();
  }
}, foodController.listFoodBags);

// POST /api/v1/food — DONOR или ADMIN
router.post("/", authenticate, authorize(Role.DONOR, Role.ADMIN), foodController.createFoodBag);

// GET /api/v1/food/:id — динамический, после всех статичных
router.get("/:id", foodController.getFoodBag);

// POST /api/v1/food/:id/reserve
router.post("/:id/reserve", authenticate, foodController.reserveFoodBag);

// PATCH /api/v1/food/:id/status — ADMIN only
router.patch("/:id/status", authenticate, authorize(Role.ADMIN), foodController.updateFoodStatus);

export default router;