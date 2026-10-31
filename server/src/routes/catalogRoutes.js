import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
    createProduct, listProducts, getProduct, updateProduct, deactivateProduct,
    createVariant, listVariants, updateVariant, deleteVariant,
    createPlan, listPlans, getPlan, updatePlan, updatePlanStatus,
} from "../controllers/catalogController.js";

const router = express.Router();

const requireJsonObject = (req, res, next) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ message: "A JSON object body is required" });
    }
    next();
};

router.post("/products", protect, authorizeRoles("ADMIN"), requireJsonObject, createProduct);
router.get("/products", protect, listProducts);
router.get("/products/:id/variants", protect, listVariants);
router.post("/products/:id/variants", protect, authorizeRoles("ADMIN"), requireJsonObject, createVariant);
router.get("/products/:id", protect, getProduct);
router.patch("/products/:id", protect, authorizeRoles("ADMIN"), requireJsonObject, updateProduct);
router.delete("/products/:id", protect, authorizeRoles("ADMIN"), deactivateProduct);

router.patch("/variants/:id", protect, authorizeRoles("ADMIN"), requireJsonObject, updateVariant);
router.delete("/variants/:id", protect, authorizeRoles("ADMIN"), deleteVariant);

router.post("/plans", protect, authorizeRoles("ADMIN"), requireJsonObject, createPlan);
router.get("/plans", protect, listPlans);
router.get("/plans/:id", protect, getPlan);
router.patch("/plans/:id/status", protect, authorizeRoles("ADMIN"), requireJsonObject, updatePlanStatus);
router.patch("/plans/:id", protect, authorizeRoles("ADMIN"), requireJsonObject, updatePlan);

export default router;
