import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
    getDashboardReport, getRevenueReport, getSubscriptionReport, getInvoiceReport,
    getPaymentReport, getTopCustomersReport, getExpiringSubscriptionsReport,
    getOutstandingInvoicesReport,
} from "../controllers/reportController.js";

const router = express.Router();
const reportAccess = [protect, authorizeRoles("ADMIN", "STAFF")];

router.get("/reports/dashboard", ...reportAccess, getDashboardReport);
router.get("/reports/revenue", ...reportAccess, getRevenueReport);
router.get("/reports/subscriptions", ...reportAccess, getSubscriptionReport);
router.get("/reports/invoices", ...reportAccess, getInvoiceReport);
router.get("/reports/payments", ...reportAccess, getPaymentReport);
router.get("/reports/top-customers", ...reportAccess, getTopCustomersReport);
router.get("/reports/expiring-subscriptions", ...reportAccess, getExpiringSubscriptionsReport);
router.get("/reports/outstanding-invoices", ...reportAccess, getOutstandingInvoicesReport);

export default router;
