import pool from "../config/db.js";
import { sendEmail } from "./sendEmail.js";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 100;
const emailHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character])).replace(/\n/g, "<br>");

const sendNotification = async (id) => {
    const claimed = await pool.query(
        `UPDATE notifications
         SET attempts = attempts + 1, processing_at = NOW()
         WHERE id = $1 AND channel = 'EMAIL' AND status IN ('PENDING', 'FAILED')
           AND attempts < $2 AND next_attempt_at <= NOW()
           AND (processing_at IS NULL OR processing_at < NOW() - INTERVAL '10 minutes')
         RETURNING id, user_id, type, subject, message, dedupe_key, attempts`,
        [id, MAX_ATTEMPTS]
    );
    if (!claimed.rows.length) return false;
    const notification = claimed.rows[0];
    try {
        const recipient = await pool.query("SELECT email FROM users WHERE id = $1", [notification.user_id]);
        const sent = recipient.rows[0]?.email && await sendEmail({
            to: recipient.rows[0].email,
            subject: notification.subject,
            html: `<p>${emailHtml(notification.message)}</p>`,
            messageId: `<${Buffer.from(notification.dedupe_key).toString("base64url")}@substrack.local>`,
        });
        if (!sent) throw new Error("SMTP delivery failed or SMTP is not configured");
        await pool.query(
            `UPDATE notifications
             SET status = 'SENT', sent_at = NOW(), error_message = NULL, processing_at = NULL
             WHERE id = $1`,
            [id]
        );
        return true;
    } catch (error) {
        const delayMinutes = notification.attempts === 1 ? 5 : 30;
        await pool.query(
            `UPDATE notifications
             SET status = 'FAILED', error_message = $2, processing_at = NULL,
                 next_attempt_at = NOW() + ($3 * INTERVAL '1 minute')
             WHERE id = $1`,
            [id, String(error.message || "Email delivery failed").slice(0, 1000), delayMinutes]
        );
        console.error("Notification email failed", { notificationId: id, type: notification.type });
        return false;
    }
};

const createForUser = async ({ userId, type, subject, message, relatedType, relatedId, dedupeKey }) => {
    const client = await pool.connect();
    let emailNotificationId;
    try {
        await client.query("BEGIN");
        await client.query(
            `INSERT INTO notifications
             (user_id, type, channel, subject, message, status, related_type, related_id, dedupe_key)
             VALUES ($1, $2, 'IN_APP', $3, $4, 'PENDING', $5, $6, $7)
             ON CONFLICT (dedupe_key) DO NOTHING`,
            [userId, type, subject, message, relatedType ?? null, relatedId ?? null, `${dedupeKey}:IN_APP`]
        );
        const emailRow = await client.query(
            `INSERT INTO notifications
             (user_id, type, channel, subject, message, status, related_type, related_id, dedupe_key)
             VALUES ($1, $2, 'EMAIL', $3, $4, 'PENDING', $5, $6, $7)
             ON CONFLICT (dedupe_key) DO NOTHING
             RETURNING id`,
            [userId, type, subject, message, relatedType ?? null, relatedId ?? null, `${dedupeKey}:EMAIL`]
        );
        emailNotificationId = emailRow.rows[0]?.id;
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
    if (emailNotificationId) await sendNotification(emailNotificationId);
};

export const notifyInvoiceCreated = async (invoiceId) => {
    try {
        const { rows } = await pool.query(
            `SELECT i.id, i.invoice_number, i.due_date, i.total, u.id AS user_id,
                    u.name
             FROM invoices i JOIN users u ON u.id = i.customer_id WHERE i.id = $1`,
            [invoiceId]
        );
        const invoice = rows[0];
        if (!invoice) return;
        await createForUser({
            userId: invoice.user_id, type: "INVOICE_CREATED",
            subject: `Invoice ${invoice.invoice_number} created`,
            message: `Hello ${invoice.name}, invoice ${invoice.invoice_number} for ${invoice.total} is available. Payment is due by ${invoice.due_date}.`,
            relatedType: "INVOICE", relatedId: invoice.id, dedupeKey: `INVOICE_CREATED:${invoice.id}`,
        });
    } catch (error) {
        console.error("Could not queue invoice notification", { invoiceId, code: error.code ?? "NOTIFICATION_ERROR" });
    }
};

export const notifyPaymentReceived = async (paymentId) => {
    try {
        const { rows } = await pool.query(
            `SELECT p.id, p.amount, p.payment_date, i.invoice_number,
                    u.id AS user_id, u.name
             FROM payments p JOIN invoices i ON i.id = p.invoice_id
             JOIN users u ON u.id = i.customer_id WHERE p.id = $1`,
            [paymentId]
        );
        const payment = rows[0];
        if (!payment) return;
        await createForUser({
            userId: payment.user_id, type: "PAYMENT_RECEIVED",
            subject: `Payment received for ${payment.invoice_number}`,
            message: `Hello ${payment.name}, we received your payment of ${payment.amount} for invoice ${payment.invoice_number}.`,
            relatedType: "PAYMENT", relatedId: payment.id, dedupeKey: `PAYMENT_RECEIVED:${payment.id}`,
        });
    } catch (error) {
        console.error("Could not queue payment notification", { paymentId, code: error.code ?? "NOTIFICATION_ERROR" });
    }
};

export const notifyBillingFailure = async (subscriptionId, errorCode = "PROCESSING_ERROR") => {
    try {
        const { rows } = await pool.query(
            `SELECT s.subscription_number, u.name AS customer_name
             FROM subscriptions s JOIN users u ON u.id = s.customer_id WHERE s.id = $1`,
            [subscriptionId]
        );
        if (!rows.length) return;
        const administrators = await pool.query(
            "SELECT id FROM users WHERE role IN ('ADMIN', 'STAFF') ORDER BY id"
        );
        const today = new Date().toISOString().slice(0, 10);
        for (const recipient of administrators.rows) {
            try {
                await createForUser({
                    userId: recipient.id, type: "RECURRING_BILLING_FAILED",
                    subject: `Recurring billing failed for ${rows[0].subscription_number}`,
                    message: `Billing failed for customer ${rows[0].customer_name}'s subscription ${rows[0].subscription_number}. Error code: ${errorCode}.`,
                    relatedType: "SUBSCRIPTION", relatedId: subscriptionId,
                    dedupeKey: `BILLING_FAILED:${subscriptionId}:${today}:${recipient.id}`,
                });
            } catch (error) {
                console.error("Could not queue billing failure notification", {
                    subscriptionId, userId: recipient.id, code: error.code ?? "NOTIFICATION_ERROR",
                });
            }
        }
    } catch (error) {
        console.error("Could not queue billing failure notification", {
            subscriptionId, code: error.code ?? "NOTIFICATION_ERROR",
        });
    }
};

const queueReminder = async (row, type, subject, message, key, relatedType) => {
    await createForUser({
        userId: row.user_id, type, subject, message,
        relatedType, relatedId: row.id, dedupeKey: key,
    });
};

export const runNotificationRetries = async () => {
    try {
        const { rows } = await pool.query(
            `SELECT id FROM notifications
             WHERE channel = 'EMAIL' AND status IN ('PENDING', 'FAILED') AND attempts < $1
               AND next_attempt_at <= NOW()
               AND (processing_at IS NULL OR processing_at < NOW() - INTERVAL '10 minutes')
             ORDER BY next_attempt_at, id LIMIT $2`,
            [MAX_ATTEMPTS, BATCH_SIZE]
        );
        for (const row of rows) {
            try {
                await sendNotification(row.id);
            } catch (error) {
                console.error("Notification retry failed", { notificationId: row.id, code: error.code ?? "RETRY_ERROR" });
            }
        }
    } catch (error) {
        console.error("Could not load notification retries", { code: error.code ?? "RETRY_QUERY_ERROR" });
    }
};

export const runNotificationReminders = async () => {
    const renewalDays = Number.parseInt(process.env.RENEWAL_REMINDER_DAYS || "3", 10);
    const expiryDays = Number.parseInt(process.env.EXPIRY_REMINDER_DAYS || "3", 10);
    const overdueHours = Number.parseInt(process.env.OVERDUE_REMINDER_INTERVAL_HOURS || "24", 10);
    try {
        const renewal = await pool.query(
            `SELECT s.id, s.subscription_number, s.next_billing_date::text AS event_date,
                    u.id AS user_id, u.name
             FROM subscriptions s JOIN users u ON u.id = s.customer_id
             WHERE s.status = 'ACTIVE' AND s.next_billing_date = CURRENT_DATE + $1::integer
               AND NOT EXISTS (
                   SELECT 1 FROM notifications n
                   WHERE n.channel = 'IN_APP'
                     AND n.dedupe_key = 'RENEWAL:' || s.id::text || ':' || s.next_billing_date::text || ':IN_APP'
               )
             ORDER BY s.id LIMIT $2`,
            [Number.isInteger(renewalDays) && renewalDays >= 0 && renewalDays <= 365 ? renewalDays : 3, BATCH_SIZE]
        );
        for (const row of renewal.rows) {
            try {
                await queueReminder(row, "UPCOMING_RENEWAL", "Upcoming subscription renewal",
                    `Hello ${row.name}, subscription ${row.subscription_number} is due for renewal on ${row.event_date}.`,
                    `RENEWAL:${row.id}:${row.event_date}`, "SUBSCRIPTION");
            } catch (error) {
                console.error("Could not queue renewal reminder", { subscriptionId: row.id, code: error.code ?? "NOTIFICATION_ERROR" });
            }
        }
    } catch (error) {
        console.error("Upcoming renewal reminders failed", { code: error.code ?? "REMINDER_QUERY_ERROR" });
    }
    try {
        const expiring = await pool.query(
            `SELECT s.id, s.subscription_number, s.expiry_date::text AS event_date,
                    u.id AS user_id, u.name
             FROM subscriptions s JOIN users u ON u.id = s.customer_id
             WHERE s.status = 'ACTIVE' AND s.expiry_date = CURRENT_DATE + $1::integer
               AND NOT EXISTS (
                   SELECT 1 FROM notifications n
                   WHERE n.channel = 'IN_APP'
                     AND n.dedupe_key = 'EXPIRY:' || s.id::text || ':' || s.expiry_date::text || ':IN_APP'
               )
             ORDER BY s.id LIMIT $2`,
            [Number.isInteger(expiryDays) && expiryDays >= 0 && expiryDays <= 365 ? expiryDays : 3, BATCH_SIZE]
        );
        for (const row of expiring.rows) {
            try {
                await queueReminder(row, "SUBSCRIPTION_EXPIRING", "Subscription expiring soon",
                    `Hello ${row.name}, subscription ${row.subscription_number} expires on ${row.event_date}.`,
                    `EXPIRY:${row.id}:${row.event_date}`, "SUBSCRIPTION");
            } catch (error) {
                console.error("Could not queue subscription expiry reminder", {
                    subscriptionId: row.id, code: error.code ?? "NOTIFICATION_ERROR",
                });
            }
        }
    } catch (error) {
        console.error("Subscription expiry reminders failed", { code: error.code ?? "REMINDER_QUERY_ERROR" });
    }
    try {
        const reminderHours = Number.isInteger(overdueHours) && overdueHours >= 1 && overdueHours <= 720
            ? overdueHours
            : 24;
        const overdue = await pool.query(
            `SELECT i.id, i.invoice_number, i.due_date::text AS event_date,
                    i.total - i.amount_paid AS balance, u.id AS user_id, u.name,
                    FLOOR(EXTRACT(EPOCH FROM NOW()) / ($1 * 3600))::bigint::text AS reminder_slot
             FROM invoices i JOIN users u ON u.id = i.customer_id
             WHERE i.status = 'CONFIRMED' AND i.due_date < CURRENT_DATE
               AND i.amount_paid < i.total
               AND NOT EXISTS (
                   SELECT 1 FROM notifications n
                   WHERE n.channel = 'IN_APP'
                     AND n.dedupe_key = 'OVERDUE:' || i.id::text || ':'
                         || FLOOR(EXTRACT(EPOCH FROM NOW()) / ($1 * 3600))::bigint::text || ':IN_APP'
               )
             ORDER BY i.due_date, i.id LIMIT $2`,
            [reminderHours, BATCH_SIZE]
        );
        for (const row of overdue.rows) {
            try {
                await queueReminder(row, "OVERDUE_INVOICE", `Overdue invoice ${row.invoice_number}`,
                    `Hello ${row.name}, invoice ${row.invoice_number} is overdue. Outstanding balance: ${row.balance}.`,
                    `OVERDUE:${row.id}:${row.reminder_slot}`, "INVOICE");
            } catch (error) {
                console.error("Could not queue overdue invoice reminder", { invoiceId: row.id, code: error.code ?? "NOTIFICATION_ERROR" });
            }
        }
    } catch (error) {
        console.error("Overdue invoice reminders failed", { code: error.code ?? "REMINDER_QUERY_ERROR" });
    }
};

export const retryNotification = async (id) => {
    const reset = await pool.query(
        `UPDATE notifications SET next_attempt_at = NOW(), error_message = NULL
         WHERE id = $1 AND channel = 'EMAIL' AND status = 'FAILED' AND attempts < $2
         RETURNING id`,
        [id, MAX_ATTEMPTS]
    );
    if (!reset.rows.length) return { accepted: false };
    const sent = await sendNotification(id);
    return { accepted: true, sent };
};
