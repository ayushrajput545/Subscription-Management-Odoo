import pool from "../config/db.js";

const groupings = new Set(["day", "week", "month", "year"]);
const validDate = (value) => typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const dateFilterError = (query) => {
    if (query.startDate !== undefined && !validDate(query.startDate)) return "startDate must be a valid YYYY-MM-DD date";
    if (query.endDate !== undefined && !validDate(query.endDate)) return "endDate must be a valid YYYY-MM-DD date";
    if (query.startDate && query.endDate && query.startDate > query.endDate) return "startDate cannot be after endDate";
    return null;
};
const dateConditions = (column, query, values) => {
    const conditions = [];
    if (query.startDate) {
        values.push(query.startDate);
        conditions.push(`${column} >= $${values.length}::date`);
    }
    if (query.endDate) {
        values.push(query.endDate);
        conditions.push(`${column} < ($${values.length}::date + INTERVAL '1 day')`);
    }
    return conditions;
};
const fail = (res, error, context) => {
    console.error(context, error);
    return res.status(500).json({ message: "Could not load report data" });
};
const validateDates = (req, res) => {
    const error = dateFilterError(req.query);
    if (error) {
        res.status(400).json({ message: error });
        return false;
    }
    return true;
};
const validateGrouping = (req, res) => {
    const grouping = req.query.groupBy ?? "month";
    if (typeof grouping !== "string" || !groupings.has(grouping)) {
        res.status(400).json({ message: "groupBy must be day, week, month, or year" });
        return null;
    }
    return grouping;
};
const dateParams = (query) => ({ startDate: query.startDate ?? null, endDate: query.endDate ?? null });

export const getAdminDashboardSummary = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM users)::integer AS total_users,
                (SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE')::integer AS active_subscriptions,
                (SELECT COALESCE(SUM(p.amount), 0)::numeric(14,2)
                 FROM payments p JOIN invoices i ON i.id = p.invoice_id
                 WHERE i.status <> 'CANCELLED') AS collected_amount,
                (SELECT COUNT(*)::integer FROM invoices
                 WHERE status <> 'CANCELLED' AND amount_paid < total) AS outstanding_invoice_count`
        );
        return res.json({ summary: rows[0] });
    } catch (error) {
        return fail(res, error, "Admin dashboard summary failed:");
    }
};

export const getDashboardReport = async (req, res) => {
    if (!validateDates(req, res)) return;
    const daysValue = req.query.expiringDays ?? "30";
    const expiringDays = Number(daysValue);
    if (!Number.isInteger(expiringDays) || expiringDays < 1 || expiringDays > 365) {
        return res.status(400).json({ message: "expiringDays must be an integer from 1 to 365" });
    }
    try {
        const { rows } = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM users WHERE role = 'CUSTOMER')::integer AS total_customers,
                (SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE')::integer AS active_subscriptions,
                (SELECT COUNT(*) FROM subscriptions
                 WHERE status = 'ACTIVE' AND expiry_date >= CURRENT_DATE
                   AND expiry_date <= CURRENT_DATE + $1::integer)::integer AS expiring_soon,
                (SELECT COUNT(*) FROM invoices
                 WHERE status = 'CONFIRMED' AND due_date < CURRENT_DATE
                   AND amount_paid < total)::integer AS overdue_invoices,
                (SELECT COALESCE(SUM(total), 0)::numeric(14,2) FROM invoices
                 WHERE status <> 'CANCELLED'
                   AND ($2::date IS NULL OR invoice_date >= $2::date)
                   AND ($3::date IS NULL OR invoice_date < ($3::date + INTERVAL '1 day'))) AS invoiced_amount,
                (SELECT COALESCE(SUM(p.amount), 0)::numeric(14,2)
                 FROM payments p JOIN invoices i ON i.id = p.invoice_id
                 WHERE i.status <> 'CANCELLED'
                   AND ($2::date IS NULL OR p.payment_date >= $2::date)
                   AND ($3::date IS NULL OR p.payment_date < ($3::date + INTERVAL '1 day'))) AS collected_amount,
                (SELECT COALESCE(SUM(total - amount_paid), 0)::numeric(14,2) FROM invoices
                 WHERE status <> 'CANCELLED' AND amount_paid < total
                   AND ($2::date IS NULL OR invoice_date >= $2::date)
                   AND ($3::date IS NULL OR invoice_date < ($3::date + INTERVAL '1 day'))) AS outstanding_amount`,
            [expiringDays, req.query.startDate ?? null, req.query.endDate ?? null]
        );
        return res.json({ summary: rows[0], filters: { ...dateParams(req.query), expiringDays } });
    } catch (error) {
        return fail(res, error, "Dashboard report failed:");
    }
};

export const getRevenueReport = async (req, res) => {
    if (!validateDates(req, res)) return;
    const grouping = validateGrouping(req, res);
    if (!grouping) return;
    const values = [grouping];
    const conditions = ["i.status <> 'CANCELLED'"];
    conditions.push(...dateConditions("p.payment_date", req.query, values));
    try {
        const { rows } = await pool.query(
            `SELECT date_trunc($1, p.payment_date)::date::text AS period,
                    COALESCE(SUM(p.amount), 0)::numeric(14,2) AS collected_amount,
                    COUNT(*)::integer AS payment_count
             FROM payments p JOIN invoices i ON i.id = p.invoice_id
             WHERE ${conditions.join(" AND ")}
             GROUP BY date_trunc($1, p.payment_date)
             ORDER BY date_trunc($1, p.payment_date)`,
            values
        );
        return res.json({ grouping, revenue: rows, filters: dateParams(req.query) });
    } catch (error) {
        return fail(res, error, "Revenue report failed:");
    }
};

export const getSubscriptionReport = async (req, res) => {
    if (!validateDates(req, res)) return;
    const values = [];
    const conditions = dateConditions("s.created_at", req.query, values);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
        const [statuses, cycles] = await Promise.all([
            pool.query(`SELECT status, COUNT(*)::integer AS count FROM subscriptions s ${where} GROUP BY status ORDER BY status`, values),
            pool.query(`SELECT p.billing_cycle, COUNT(*)::integer AS count FROM subscriptions s JOIN plans p ON p.id = s.plan_id ${where} GROUP BY p.billing_cycle ORDER BY p.billing_cycle`, values),
        ]);
        return res.json({ byStatus: statuses.rows, byBillingCycle: cycles.rows });
    } catch (error) {
        return fail(res, error, "Subscription report failed:");
    }
};

export const getInvoiceReport = async (req, res) => {
    if (!validateDates(req, res)) return;
    const values = [];
    const conditions = dateConditions("i.invoice_date", req.query, values);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
        const { rows } = await pool.query(
            `SELECT status, COUNT(*)::integer AS invoice_count,
                    COALESCE(SUM(total), 0)::numeric(14,2) AS invoiced_amount,
                    COALESCE(SUM(amount_paid), 0)::numeric(14,2) AS amount_paid,
                    COALESCE(SUM(total - amount_paid), 0)::numeric(14,2) AS balance
             FROM invoices i ${where} GROUP BY i.status ORDER BY i.status`,
            values
        );
        return res.json({ invoices: rows, filters: dateParams(req.query) });
    } catch (error) {
        return fail(res, error, "Invoice report failed:");
    }
};

export const getPaymentReport = async (req, res) => {
    if (!validateDates(req, res)) return;
    const grouping = validateGrouping(req, res);
    if (!grouping) return;
    const values = [];
    const conditions = ["i.status <> 'CANCELLED'"];
    conditions.push(...dateConditions("p.payment_date", req.query, values));
    const dateValues = [grouping];
    const dateConditionsWithOffset = ["i.status <> 'CANCELLED'"];
    dateConditionsWithOffset.push(...dateConditions("p.payment_date", req.query, dateValues));
    try {
        const [methods, dates] = await Promise.all([
            pool.query(
                `SELECT p.method, COUNT(*)::integer AS payment_count,
                        COALESCE(SUM(p.amount), 0)::numeric(14,2) AS total_amount
                 FROM payments p JOIN invoices i ON i.id = p.invoice_id
                 WHERE ${conditions.join(" AND ")}
                 GROUP BY p.method ORDER BY p.method`,
                values
            ),
            pool.query(
                `SELECT date_trunc($1, p.payment_date)::date::text AS period,
                        COUNT(*)::integer AS payment_count,
                        COALESCE(SUM(p.amount), 0)::numeric(14,2) AS total_amount
                 FROM payments p JOIN invoices i ON i.id = p.invoice_id
                 WHERE ${dateConditionsWithOffset.join(" AND ")}
                 GROUP BY date_trunc($1, p.payment_date)
                 ORDER BY date_trunc($1, p.payment_date)`,
                dateValues
            ),
        ]);
        return res.json({ byMethod: methods.rows, byDate: dates.rows, grouping, filters: dateParams(req.query) });
    } catch (error) {
        return fail(res, error, "Payment report failed:");
    }
};

export const getTopCustomersReport = async (req, res) => {
    if (!validateDates(req, res)) return;
    const rawLimit = req.query.limit ?? "10";
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({ message: "limit must be an integer from 1 to 100" });
    }
    const values = [limit];
    const conditions = ["i.status <> 'CANCELLED'"];
    conditions.push(...dateConditions("p.payment_date", req.query, values));
    try {
        const { rows } = await pool.query(
            `SELECT u.id AS customer_id, u.name AS customer_name, u.email AS customer_email,
                    COUNT(DISTINCT i.id)::integer AS invoices_paid,
                    COALESCE(SUM(p.amount), 0)::numeric(14,2) AS collected_amount
             FROM payments p JOIN invoices i ON i.id = p.invoice_id
             JOIN users u ON u.id = i.customer_id
             WHERE ${conditions.join(" AND ")}
             GROUP BY u.id ORDER BY SUM(p.amount) DESC, u.name
             LIMIT $1`,
            values
        );
        return res.json({ customers: rows, filters: { ...dateParams(req.query), limit } });
    } catch (error) {
        return fail(res, error, "Top customers report failed:");
    }
};

export const getExpiringSubscriptionsReport = async (req, res) => {
    if (!validateDates(req, res)) return;
    const daysValue = req.query.days ?? "30";
    const days = Number(daysValue);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
        return res.status(400).json({ message: "days must be an integer from 1 to 365" });
    }
    try {
        const values = [days];
        const conditions = [
            "s.status = 'ACTIVE'",
            "s.expiry_date >= CURRENT_DATE",
            "s.expiry_date <= CURRENT_DATE + $1::integer",
        ];
        conditions.push(...dateConditions("s.expiry_date", req.query, values));
        const { rows } = await pool.query(
            `SELECT s.id, s.subscription_number, s.customer_id, u.name AS customer_name,
                    u.email AS customer_email, p.name AS plan_name,
                    s.expiry_date::text AS expiry_date, s.status
             FROM subscriptions s JOIN users u ON u.id = s.customer_id
             JOIN plans p ON p.id = s.plan_id
             WHERE ${conditions.join(" AND ")}
             ORDER BY s.expiry_date, s.id`,
            values
        );
        return res.json({ subscriptions: rows, days });
    } catch (error) {
        return fail(res, error, "Expiring subscriptions report failed:");
    }
};

export const getOutstandingInvoicesReport = async (req, res) => {
    if (!validateDates(req, res)) return;
    const values = [];
    const conditions = ["i.status = 'CONFIRMED'", "i.amount_paid < i.total"];
    conditions.push(...dateConditions("i.due_date", req.query, values));
    try {
        const { rows } = await pool.query(
            `SELECT i.id, i.invoice_number, i.customer_id, u.name AS customer_name,
                    u.email AS customer_email, i.invoice_date::text AS invoice_date,
                    i.due_date::text AS due_date, i.total, i.amount_paid,
                    i.total - i.amount_paid AS balance
             FROM invoices i JOIN users u ON u.id = i.customer_id
             WHERE ${conditions.join(" AND ")}
             ORDER BY i.due_date, i.id`,
            values
        );
        return res.json({ invoices: rows, filters: dateParams(req.query) });
    } catch (error) {
        return fail(res, error, "Outstanding invoices report failed:");
    }
};
