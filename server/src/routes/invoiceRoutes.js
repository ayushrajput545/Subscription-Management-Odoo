import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
    createTax, listTaxes, updateTax, deactivateTax,
    createDiscount, listDiscounts, updateDiscount, deactivateDiscount,
    applySubscriptionDiscount, listSubscriptionDiscounts, removeSubscriptionDiscount,
    generateInvoice, listInvoices, getInvoice, confirmInvoice, cancelInvoice, sendInvoice,
    downloadInvoicePdf,
} from "../controllers/invoiceController.js";

const router = express.Router();
const staffRoles = authorizeRoles("ADMIN", "STAFF");
const requireJsonObject = (req, res, next) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ message: "A JSON object body is required" });
    }
    next();
};

router.post("/taxes", protect, authorizeRoles("ADMIN"), requireJsonObject, createTax);
router.get("/taxes", protect, authorizeRoles("ADMIN"), listTaxes);
router.patch("/taxes/:id", protect, authorizeRoles("ADMIN"), requireJsonObject, updateTax);
router.delete("/taxes/:id", protect, authorizeRoles("ADMIN"), deactivateTax);

router.post("/discounts", protect, authorizeRoles("ADMIN"), requireJsonObject, createDiscount);
router.get("/discounts", protect, staffRoles, listDiscounts);
router.patch("/discounts/:id", protect, authorizeRoles("ADMIN"), requireJsonObject, updateDiscount);
router.delete("/discounts/:id", protect, authorizeRoles("ADMIN"), deactivateDiscount);
router.get("/subscriptions/:id/discounts", protect, staffRoles, listSubscriptionDiscounts);
router.post("/subscriptions/:id/discounts", protect, staffRoles, requireJsonObject, applySubscriptionDiscount);
router.delete("/subscriptions/:id/discounts/:discountId", protect, staffRoles, removeSubscriptionDiscount);

router.post("/invoices/generate/:subscriptionId", protect, staffRoles, requireJsonObject, generateInvoice);
router.get("/invoices", protect, listInvoices);
router.get("/invoices/:id/pdf", protect, downloadInvoicePdf);
router.patch("/invoices/:id/confirm", protect, staffRoles, confirmInvoice);
router.patch("/invoices/:id/cancel", protect, staffRoles, cancelInvoice);
router.post("/invoices/:id/send", protect, staffRoles, sendInvoice);
router.get("/invoices/:id", protect, getInvoice);

export default router;
