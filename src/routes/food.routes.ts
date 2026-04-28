import { Router } from "express";
import * as foodController from "../controllers/foodController";
import { authenticate, authorize } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

// GET /api/v1/food — public (token optional)
router.get("/", (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth) {
    authenticate(req, res, (err) => {
      if (err) return next();
      next();
    });
  } else {
    next();
  }
}, foodController.listFoodBags);

// POST /api/v1/food/allergens/parse — public
router.post("/allergens/parse", foodController.parseAllergensHandler);

// GET /api/v1/food/:id
router.get("/:id", foodController.getFoodBag);

// POST /api/v1/food — DONOR or ADMIN
router.post("/", authenticate, authorize(Role.DONOR, Role.ADMIN), foodController.createFoodBag);

// PATCH /api/v1/food/:id/status — ADMIN only
router.patch("/:id/status", authenticate, authorize(Role.ADMIN), foodController.updateFoodStatus);

// POST /api/v1/food/:id/reserve
router.post("/:id/reserve", authenticate, foodController.reserveFoodBag);

// DELETE /api/v1/food/reservations/:reservationId
router.delete("/reservations/:reservationId", authenticate, foodController.cancelReservation);

export default router;
