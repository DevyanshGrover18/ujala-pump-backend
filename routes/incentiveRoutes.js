import express from "express";
import { getAllClaims, getClaimById, verifyClaim, getMyClaims, deleteClaim } from "../controllers/incentiveController.js";
import { verifyToken } from "../middleware/roleMiddleware.js";

const router = express.Router();

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") return next();
  return res.status(403).json({ message: "Access denied. Admin only." });
};

router.use(verifyToken);

// Seller routes (distributor/dealer/subdealer)
router.get("/my/claims", getMyClaims);

// Admin routes
router.get("/", isAdmin, getAllClaims);
router.get("/:id", isAdmin, getClaimById);
router.post("/:id/verify", isAdmin, verifyClaim);
router.delete("/:id", isAdmin, deleteClaim);

export default router;
