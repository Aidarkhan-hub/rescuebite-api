import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import * as auctionController from "../controllers/auctionController";

const router = Router();

// DRIVER — see active auctions and place bids
router.get(
  "/",
  authenticate,
  authorize("DRIVER"),
  auctionController.listActiveAuctions
);

router.post(
  "/:id/bid",
  authenticate,
  authorize("DRIVER"),
  auctionController.placeBid
);

// ADMIN — close auction manually
router.patch(
  "/:id/close",
  authenticate,
  authorize("ADMIN"),
  auctionController.closeAuction
);

export default router;