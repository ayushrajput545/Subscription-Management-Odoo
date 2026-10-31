import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
    createQuotationTemplate, listQuotationTemplates, getQuotationTemplate,
    updateQuotationTemplate, deleteQuotationTemplate, listSubscriptionCustomers,
    createSubscription, createSubscriptionFromTemplate, listSubscriptions,
    getSubscription, updateSubscription, updateSubscriptionStatus,
} from "../controllers/subscriptionController.js";

const router = express.Router();
const staffRoles = authorizeRoles("ADMIN", "STAFF");
const requireJsonObject = (req, res, next) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ message: "A JSON object body is required" });
    }
    next();
};

router.post("/quotation-templates", protect, staffRoles, requireJsonObject, createQuotationTemplate);
router.get("/quotation-templates", protect, staffRoles, listQuotationTemplates);
router.get("/quotation-templates/:id", protect, staffRoles, getQuotationTemplate);
router.patch("/quotation-templates/:id", protect, staffRoles, requireJsonObject, updateQuotationTemplate);
router.delete("/quotation-templates/:id", protect, authorizeRoles("ADMIN"), deleteQuotationTemplate);

router.get("/subscriptions/customers", protect, staffRoles, listSubscriptionCustomers);
router.post("/subscriptions/from-template/:id", protect, staffRoles, requireJsonObject, createSubscriptionFromTemplate);
router.post("/subscriptions", protect, staffRoles, requireJsonObject, createSubscription);
router.get("/subscriptions/my", protect, authorizeRoles("CUSTOMER"), listSubscriptions);
router.get("/subscriptions", protect, listSubscriptions);
router.get("/subscriptions/:id", protect, getSubscription);
router.patch("/subscriptions/:id/status", protect, staffRoles, requireJsonObject, updateSubscriptionStatus);
router.patch("/subscriptions/:id", protect, staffRoles, requireJsonObject, updateSubscription);

export default router;
