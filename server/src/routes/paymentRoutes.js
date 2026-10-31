import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
    recordPayment, listPayments, getPayment, listInvoicePayments,
    listOutstandingInvoices, getPaymentSummary,
} from "../controllers/paymentController.js";

const router = express.Router();
const staffRoles = authorizeRoles("ADMIN", "STAFF");
const requireJsonObject = (req, res, next) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ message: "A JSON object body is required" });
    }
    next();
};

router.post("/payments", protect, staffRoles, requireJsonObject, recordPayment);
router.get("/payments", protect, staffRoles, listPayments);
router.get("/payments/summary", protect, staffRoles, getPaymentSummary);
router.get("/payments/:id", protect, getPayment);
router.get("/invoices/outstanding", protect, staffRoles, listOutstandingInvoices);
router.get("/invoices/:id/payments", protect, listInvoicePayments);

export default router;
