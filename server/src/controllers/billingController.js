import pool from "../config/db.js";
import { getBillingRunStatus, runBilling } from "../jobs/recurringBillingJob.js";

export const triggerBillingRun = async (req, res) => {
    const result = await runBilling("manual");
    if (!result.started) return res.status(409).json({ message: "A billing run is already in progress" });
    return res.json({ message: "Billing run completed", ...result });
};

export const getBillingStatus = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT i.id, i.invoice_number, i.invoice_date::text AS invoice_date,
                    i.billing_period_start::text AS billing_period_start,
                    i.billing_period_end::text AS billing_period_end,
                    i.total, i.status, u.name AS customer_name
             FROM invoices i JOIN users u ON u.id = i.customer_id
             ORDER BY i.created_at DESC, i.id DESC LIMIT 10`
        );
        return res.json({ ...getBillingRunStatus(), recentActivity: rows });
    } catch (error) {
        console.error("Get billing status failed:", error);
        return res.status(500).json({ message: "Could not load billing status" });
    }
};
