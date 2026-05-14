import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as restaurantController from "../controllers/restaurantController";

const router = Router();

// Public — list & get
router.get("/", authenticate, restaurantController.listRestaurants);
router.get("/:id", authenticate, restaurantController.getRestaurant);

// DONOR — create restaurant
router.post(
  "/",
  authenticate,
  authorize("DONOR"),
  restaurantController.createRestaurant
);

// RECIPIENT — rate restaurant
router.post(
  "/:id/rate",
  authenticate,
  authorize("RECIPIENT"),
  restaurantController.rateRestaurant
);

// ADMIN — approve / block
router.patch(
  "/:id/approve",
  authenticate,
  authorize("ADMIN"),
  restaurantController.approveRestaurant
);

router.patch(
  "/:id/block",
  authenticate,
  authorize("ADMIN"),
  restaurantController.blockRestaurant
);

export default router;