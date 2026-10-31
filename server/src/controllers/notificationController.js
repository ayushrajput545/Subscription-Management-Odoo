import pool from "../config/db.js";
import { retryNotification } from "../utils/notificationService.js";

const validId = (value) => /^[1-9]\d*$/.test(String(value));
const invalid = (res, message) => res.status(400).json({ message });
const pagination = (query) => {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return null;
    return { page, limit, offset: (page - 1) * limit };
};
const databaseError = (res, error, context) => {
    console.error(context, error);
    return res.status(500).json({ message: "Internal server error" });
};

export const listNotifications = async (req, res) => {
    const page = pagination(req.query);
    if (!page) return invalid(res, "page must be positive and limit must be between 1 and 100");
    try {
        const [count, result] = await Promise.all([
            pool.query(
                "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND channel = 'IN_APP'",
                [req.user.id]
            ),
            pool.query(
                `SELECT id, type, subject, message, status, related_type, related_id,
                        created_at, read_at
                 FROM notifications
                 WHERE user_id = $1 AND channel = 'IN_APP'
                 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
                [req.user.id, page.limit, page.offset]
            ),
        ]);
        return res.json({
            notifications: result.rows,
            pagination: { page: page.page, limit: page.limit, total: Number(count.rows[0].count) },
        });
    } catch (error) {
        return databaseError(res, error, "List notifications failed:");
    }
};

export const getUnreadNotificationCount = async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND channel = 'IN_APP' AND status = 'PENDING'",
            [req.user.id]
        );
        return res.json({ unread_count: Number(rows[0].count) });
    } catch (error) {
        return databaseError(res, error, "Count unread notifications failed:");
    }
};

export const markNotificationRead = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid notification ID");
    try {
        const { rows } = await pool.query(
            `UPDATE notifications SET status = 'READ', read_at = COALESCE(read_at, NOW())
             WHERE id = $1 AND user_id = $2 AND channel = 'IN_APP'
             RETURNING id, status, read_at`,
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ message: "Notification not found" });
        return res.json({ notification: rows[0] });
    } catch (error) {
        return databaseError(res, error, "Mark notification read failed:");
    }
};

export const markAllNotificationsRead = async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE notifications SET status = 'READ', read_at = NOW()
             WHERE user_id = $1 AND channel = 'IN_APP' AND status = 'PENDING'`,
            [req.user.id]
        );
        return res.json({ updated: result.rowCount });
    } catch (error) {
        return databaseError(res, error, "Mark all notifications read failed:");
    }
};

export const listAdminNotifications = async (req, res) => {
    const page = pagination(req.query);
    if (!page) return invalid(res, "page must be positive and limit must be between 1 and 100");
    const allowedStatuses = ["PENDING", "SENT", "FAILED", "READ"];
    const allowedChannels = ["EMAIL", "IN_APP"];
    if (req.query.status && !allowedStatuses.includes(req.query.status)) return invalid(res, "Invalid notification status");
    if (req.query.channel && !allowedChannels.includes(req.query.channel)) return invalid(res, "Invalid notification channel");
    const values = [];
    const clauses = [];
    if (req.query.status) {
        values.push(req.query.status);
        clauses.push(`n.status = $${values.length}`);
    }
    if (req.query.channel) {
        values.push(req.query.channel);
        clauses.push(`n.channel = $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    try {
        const [count, result] = await Promise.all([
            pool.query(`SELECT COUNT(*) FROM notifications n ${where}`, values),
            pool.query(
                `SELECT n.id, n.user_id, u.name AS user_name, u.email AS user_email,
                        n.type, n.channel, n.subject, n.status, n.attempts, n.sent_at,
                        n.read_at, n.error_message, n.related_type, n.related_id,
                        n.created_at, n.next_attempt_at
                 FROM notifications n LEFT JOIN users u ON u.id = n.user_id ${where}
                 ORDER BY n.created_at DESC, n.id DESC
                 LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
                [...values, page.limit, page.offset]
            ),
        ]);
        return res.json({
            notifications: result.rows,
            pagination: { page: page.page, limit: page.limit, total: Number(count.rows[0].count) },
        });
    } catch (error) {
        return databaseError(res, error, "List admin notifications failed:");
    }
};

export const retryFailedNotification = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid notification ID");
    try {
        const result = await retryNotification(req.params.id);
        if (!result.accepted) {
            const existing = await pool.query(
                "SELECT status, attempts FROM notifications WHERE id = $1 AND channel = 'EMAIL'",
                [req.params.id]
            );
            if (!existing.rows.length) return res.status(404).json({ message: "Email notification not found" });
            return res.status(409).json({ message: "Notification is not retryable or has reached its retry limit" });
        }
        return res.json({
            message: result.sent ? "Notification sent" : "Retry attempted; delivery failed",
            sent: result.sent,
        });
    } catch (error) {
        return databaseError(res, error, "Retry notification failed:");
    }
};
