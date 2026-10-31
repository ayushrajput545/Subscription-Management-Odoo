import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { getBillingStatus, triggerBillingRun } from "../controllers/billingController.js";

const router = express.Router();

router.post("/billing/run", protect, authorizeRoles("ADMIN"), triggerBillingRun);
router.get("/billing/status", protect, authorizeRoles("ADMIN", "STAFF"), getBillingStatus);

export default router;
