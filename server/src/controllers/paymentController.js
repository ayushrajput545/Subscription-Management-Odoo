import pool from "../config/db.js";
import { notifyPaymentReceived } from "../utils/notificationService.js";

const idPattern = /^[1-9]\d*$/;
const validId = (value) => idPattern.test(String(value));
const validDate = (value) => typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    (!/^\d{4}-\d{2}-\d{2}/.test(value) || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10));
const validAmount = (value) => value !== "" && value !== null && value !== undefined &&
    Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 9999999999.99 &&
    /^\d+(\.\d{1,2})?$/.test(String(value));
const methods = ["CASH", "BANK_TRANSFER", "CARD", "UPI", "OTHER"];
const invalid = (res, message) => res.status(400).json({ message });
const databaseError = (res, error, context) => {
    if (error.code === "23503") return res.status(409).json({ message: "A referenced record does not exist" });
    if (["23514", "22P02", "22003"].includes(error.code)) return res.status(400).json({ message: "Invalid field value" });
    console.error(context, error);
    return res.status(500).json({ message: "Internal server error" });
};
const centsFrom = (value) => {
    const [whole, fraction = ""] = String(value).split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
};
const moneyFromCents = (value) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
const validDateRange = (query) => {
    if (query.from !== undefined && (typeof query.from !== "string" || !validDate(query.from))) return "from must be a valid date or timestamp";
    if (query.to !== undefined && (typeof query.to !== "string" || !validDate(query.to))) return "to must be a valid date or timestamp";
    if (query.from && query.to && String(query.from) > String(query.to)) return "from cannot be after to";
    return null;
};
const buildPaymentFilters = (query, { searchable = true } = {}) => {
    const values = [];
    const clauses = [];
    const add = (value, clause) => {
        values.push(value);
        clauses.push(clause.replace("?", `$${values.length}`));
    };
    if (query.invoice_id !== undefined) add(query.invoice_id, "p.invoice_id = ?");
    if (query.method) add(query.method, "p.method = ?");
    if (query.from) add(query.from, "p.payment_date >= ?::timestamptz");
    if (query.to) add(query.to, "p.payment_date < (?::date + INTERVAL '1 day')");
    if (searchable && query.search) {
        values.push(`%${String(query.search).trim()}%`);
        clauses.push(`(i.invoice_number ILIKE $${values.length} OR u.name ILIKE $${values.length} OR p.reference ILIKE $${values.length})`);
    }
    return { values, where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "" };
};
const paymentSelect = `
    SELECT p.*, i.invoice_number, i.customer_id, u.name AS customer_name,
           recorder.name AS recorded_by_name
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    JOIN users u ON u.id = i.customer_id
    JOIN users recorder ON recorder.id = p.recorded_by`;

export const recordPayment = async (req, res) => {
    const { invoice_id: invoiceId, amount, method, payment_date: paymentDate, reference = null, note = null } = req.body;
    if (!validId(invoiceId)) return invalid(res, "A valid invoice_id is required");
    if (!validAmount(amount)) return invalid(res, "amount must be positive with at most two decimal places");
    if (!methods.includes(method)) return invalid(res, "Invalid payment method");
    if (!validDate(paymentDate)) return invalid(res, "payment_date must be a valid date or timestamp");
    if (reference !== null && (typeof reference !== "string" || reference.length > 255)) return invalid(res, "reference must be 255 characters or fewer");
    if (note !== null && typeof note !== "string") return invalid(res, "note must be a string or null");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            `SELECT id, customer_id, status, total, amount_paid,
                    total - amount_paid AS outstanding
             FROM invoices WHERE id = $1 FOR UPDATE`,
            [invoiceId]
        );
        if (!rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Invoice not found" });
        }
        const invoice = rows[0];
        if (invoice.status !== "CONFIRMED") {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Payments are only accepted for confirmed invoices with an outstanding balance" });
        }
        const balance = centsFrom(invoice.outstanding);
        const paymentAmount = centsFrom(amount);
        if (balance <= 0n) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Invoice has no outstanding balance" });
        }
        if (paymentAmount > balance) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Payment exceeds the outstanding balance", outstanding: moneyFromCents(balance) });
        }
        const newAmountPaid = centsFrom(invoice.amount_paid) + paymentAmount;
        const nextStatus = newAmountPaid === centsFrom(invoice.total) ? "PAID" : "CONFIRMED";
        const inserted = await client.query(
            `INSERT INTO payments (invoice_id, amount, method, payment_date, reference, note, recorded_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [invoiceId, amount, method, new Date(paymentDate).toISOString(), reference?.trim() || null, note?.trim() || null, req.user.id]
        );
        await client.query(
            `UPDATE invoices SET amount_paid = $1, status = $2, updated_at = NOW()
             WHERE id = $3`,
            [moneyFromCents(newAmountPaid), nextStatus, invoiceId]
        );
        const payment = await client.query(
            `${paymentSelect} WHERE p.id = $1`,
            [inserted.rows[0].id]
        );
        await client.query("COMMIT");
        await notifyPaymentReceived(inserted.rows[0].id);
        return res.status(201).json({
            payment: payment.rows[0],
            invoice: {
                id: invoice.id,
                total: invoice.total,
                amount_paid: moneyFromCents(newAmountPaid),
                outstanding: moneyFromCents(balance - paymentAmount),
                status: nextStatus,
            },
        });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Record payment failed:");
    } finally {
        client.release();
    }
};

export const listPayments = async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return invalid(res, "page must be positive and limit must be between 1 and 100");
    }
    if (req.query.invoice_id !== undefined && !validId(req.query.invoice_id)) return invalid(res, "Invalid invoice_id");
    if (req.query.method && !methods.includes(req.query.method)) return invalid(res, "Invalid payment method");
    const dateError = validDateRange(req.query);
    if (dateError) return invalid(res, dateError);
    const { values, where } = buildPaymentFilters(req.query);
    try {
        const count = await pool.query(
            `SELECT COUNT(*) FROM payments p JOIN invoices i ON i.id = p.invoice_id
             JOIN users u ON u.id = i.customer_id ${where}`,
            values
        );
        const { rows } = await pool.query(
            `${paymentSelect} ${where}
             ORDER BY p.payment_date DESC, p.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, (page - 1) * limit]
        );
        return res.json({ payments: rows, pagination: { page, limit, total: Number(count.rows[0].count) } });
    } catch (error) {
        return databaseError(res, error, "List payments failed:");
    }
};

export const getPayment = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid payment ID");
    const customerOnly = req.user.role === "CUSTOMER";
    try {
        const { rows } = await pool.query(
            `${paymentSelect} WHERE p.id = $1 AND ($2::bigint IS NULL OR i.customer_id = $2)`,
            [req.params.id, customerOnly ? req.user.id : null]
        );
        if (!rows.length) return res.status(404).json({ message: "Payment not found" });
        return res.json({ payment: rows[0] });
    } catch (error) {
        return databaseError(res, error, "Get payment failed:");
    }
};

export const listInvoicePayments = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid invoice ID");
    const customerOnly = req.user.role === "CUSTOMER";
    try {
        const invoice = await pool.query(
            "SELECT id, customer_id FROM invoices WHERE id = $1 AND ($2::bigint IS NULL OR customer_id = $2)",
            [req.params.id, customerOnly ? req.user.id : null]
        );
        if (!invoice.rows.length) return res.status(404).json({ message: "Invoice not found" });
        const { rows } = await pool.query(
            `${paymentSelect} WHERE p.invoice_id = $1 ORDER BY p.payment_date DESC, p.id DESC`,
            [req.params.id]
        );
        return res.json({ payments: rows });
    } catch (error) {
        return databaseError(res, error, "List invoice payments failed:");
    }
};

export const listOutstandingInvoices = async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return invalid(res, "page must be positive and limit must be between 1 and 100");
    }
    if (req.query.search && typeof req.query.search !== "string") return invalid(res, "search must be a string");
    const values = [];
    let where = "WHERE i.status = 'CONFIRMED' AND i.amount_paid < i.total";
    if (req.query.search) {
        values.push(`%${req.query.search.trim()}%`);
        where += ` AND (i.invoice_number ILIKE $${values.length} OR u.name ILIKE $${values.length})`;
    }
    try {
        const count = await pool.query(
            `SELECT COUNT(*) FROM invoices i JOIN users u ON u.id = i.customer_id ${where}`,
            values
        );
        const { rows } = await pool.query(
            `SELECT i.id, i.invoice_number, i.customer_id, u.name AS customer_name,
                    i.invoice_date::text AS invoice_date, i.due_date::text AS due_date,
                    i.total, i.amount_paid, i.total - i.amount_paid AS outstanding
             FROM invoices i JOIN users u ON u.id = i.customer_id ${where}
             ORDER BY i.due_date, i.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, (page - 1) * limit]
        );
        return res.json({ invoices: rows, pagination: { page, limit, total: Number(count.rows[0].count) } });
    } catch (error) {
        return databaseError(res, error, "List outstanding invoices failed:");
    }
};

export const getPaymentSummary = async (req, res) => {
    const dateError = validDateRange(req.query);
    if (dateError) return invalid(res, dateError);
    const filters = [];
    const values = [];
    if (req.query.from) {
        values.push(req.query.from);
        filters.push(`payment_date >= $${values.length}::timestamptz`);
    }
    if (req.query.to) {
        values.push(req.query.to);
        filters.push(`payment_date < ($${values.length}::date + INTERVAL '1 day')`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    try {
        const { rows } = await pool.query(
            `SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total_collected,
                    COUNT(*)::integer AS payment_count
             FROM payments ${where}`,
            values
        );
        return res.json({ summary: rows[0], filters: { from: req.query.from ?? null, to: req.query.to ?? null } });
    } catch (error) {
        return databaseError(res, error, "Get payment summary failed:");
    }
};
