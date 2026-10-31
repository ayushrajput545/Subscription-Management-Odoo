import PDFDocument from "pdfkit";
import pool from "../config/db.js";
import { sendEmail } from "../utils/sendEmail.js";

const idPattern = /^[1-9]\d*$/;
const validId = (id) => idPattern.test(String(id));
const validName = (value) => typeof value === "string" && value.trim().length > 0;
const validDate = (value, nullable = false) => (nullable && (value === null || value === "")) ||
    (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const validMoney = (value, allowZero = true) => value !== "" && value !== null && value !== undefined &&
    Number.isFinite(Number(value)) && Number(value) >= (allowZero ? 0 : 0.01) &&
    Number(value) <= 9999999999.99 && /^\d+(\.\d{1,2})?$/.test(String(value));
const invalid = (res, message) => res.status(400).json({ message });
const databaseError = (res, error, context) => {
    if (error.code === "23505") return res.status(409).json({ message: "A duplicate or conflicting record already exists" });
    if (error.code === "23503" || error.code === "23001") return res.status(409).json({ message: "A referenced record is in use or does not exist" });
    if (["23514", "22P02", "22003"].includes(error.code)) return res.status(400).json({ message: "Invalid field value" });
    console.error(context, error);
    return res.status(500).json({ message: "Internal server error" });
};

const centsFrom = (value) => {
    const [whole, fraction = ""] = String(value).split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
};
const moneyFromCents = (value) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
const percentageAmount = (base, rate) => {
    const [whole, fraction = ""] = String(rate).split(".");
    const basisPoints = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return (base * basisPoints + 5000n) / 10000n;
};
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const pdfText = (value) => String(value ?? "").replace(/[^\x20-\xFF]/g, "?");

const validateDiscount = (body, partial = false) => {
    const fields = ["name", "type", "value", "min_purchase", "min_quantity", "valid_from", "valid_to", "usage_limit", "applies_to", "is_active", "product_ids"];
    if (partial && !fields.some((field) => Object.hasOwn(body, field))) return "At least one discount field is required";
    if ((!partial || Object.hasOwn(body, "name")) && !validName(body.name)) return "Name is required";
    if ((!partial || Object.hasOwn(body, "type")) && !["FIXED", "PERCENTAGE"].includes(body.type)) return "Type must be FIXED or PERCENTAGE";
    if ((!partial || Object.hasOwn(body, "value")) && !validMoney(body.value, false)) return "Value must be positive with at most two decimals";
    if (Object.hasOwn(body, "type") && body.type === "PERCENTAGE" && Object.hasOwn(body, "value") && Number(body.value) > 100) {
        return "Percentage discounts cannot exceed 100";
    }
    if (Object.hasOwn(body, "min_purchase") && !validMoney(body.min_purchase)) return "min_purchase must be nonnegative with at most two decimals";
    if (Object.hasOwn(body, "min_quantity") &&
        (!Number.isInteger(Number(body.min_quantity)) || Number(body.min_quantity) < 1 || Number(body.min_quantity) > 2147483647)) {
        return "min_quantity must be a positive integer";
    }
    for (const field of ["valid_from", "valid_to"]) {
        if (Object.hasOwn(body, field) && !validDate(body[field], true)) return `${field} must be a valid YYYY-MM-DD date or null`;
    }
    if (Object.hasOwn(body, "usage_limit") && body.usage_limit !== null &&
        (!Number.isInteger(Number(body.usage_limit)) || Number(body.usage_limit) < 1)) return "usage_limit must be a positive integer or null";
    if ((!partial || Object.hasOwn(body, "applies_to")) && !["PRODUCT", "SUBSCRIPTION"].includes(body.applies_to)) {
        return "applies_to must be PRODUCT or SUBSCRIPTION";
    }
    if (Object.hasOwn(body, "is_active") && typeof body.is_active !== "boolean") return "is_active must be a boolean";
    if (Object.hasOwn(body, "product_ids")) {
        if (!Array.isArray(body.product_ids) || body.product_ids.some((id) => !validId(id)) ||
            new Set(body.product_ids.map(String)).size !== body.product_ids.length) return "product_ids must be an array of unique valid IDs";
    }
    if (body.applies_to === "PRODUCT" && (!partial || Object.hasOwn(body, "applies_to")) &&
        (!Array.isArray(body.product_ids) || body.product_ids.length === 0)) {
        return "Product discounts require at least one target product";
    }
    if (body.type === "PERCENTAGE" && Number(body.value) > 100) return "Percentage discounts cannot exceed 100";
    const from = body.valid_from;
    const to = body.valid_to;
    if (from && to && from > to) return "valid_from cannot be after valid_to";
    return null;
};

const withProductTargets = async (client, discountId, productIds) => {
    await client.query("DELETE FROM discount_products WHERE discount_id = $1", [discountId]);
    for (const productId of productIds) {
        await client.query("INSERT INTO discount_products (discount_id, product_id) VALUES ($1, $2)", [discountId, productId]);
    }
};

export const createTax = async (req, res) => {
    const { name, rate } = req.body;
    if (!validName(name) || !validMoney(rate) || Number(rate) > 100) return invalid(res, "Name and a rate between 0 and 100 are required");
    try {
        const { rows } = await pool.query(
            "INSERT INTO taxes (name, rate) VALUES ($1, $2) RETURNING *", [name.trim(), rate]
        );
        return res.status(201).json({ tax: rows[0] });
    } catch (error) {
        return databaseError(res, error, "Create tax failed:");
    }
};

export const listTaxes = async (req, res) => {
    if (req.query.is_active !== undefined && !["true", "false"].includes(req.query.is_active)) {
        return invalid(res, "is_active must be true or false");
    }
    try {
        const { rows } = await pool.query(
            `SELECT * FROM taxes WHERE ($1::boolean IS NULL OR is_active = $1)
             ORDER BY is_active DESC, name`,
            [req.query.is_active === undefined ? null : req.query.is_active === "true"]
        );
        return res.json({ taxes: rows });
    } catch (error) {
        return databaseError(res, error, "List taxes failed:");
    }
};

export const updateTax = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid tax ID");
    const fields = ["name", "rate", "is_active"];
    if (!fields.some((field) => Object.hasOwn(req.body, field))) return invalid(res, "At least one tax field is required");
    if (Object.hasOwn(req.body, "name") && !validName(req.body.name)) return invalid(res, "Name is required");
    if (Object.hasOwn(req.body, "rate") && (!validMoney(req.body.rate) || Number(req.body.rate) > 100)) return invalid(res, "Rate must be between 0 and 100");
    if (Object.hasOwn(req.body, "is_active") && typeof req.body.is_active !== "boolean") return invalid(res, "is_active must be a boolean");
    const updates = [];
    const values = [];
    for (const field of fields) {
        if (!Object.hasOwn(req.body, field)) continue;
        values.push(field === "name" ? req.body[field].trim() : req.body[field]);
        updates.push(`${field} = $${values.length}`);
    }
    values.push(req.params.id);
    try {
        const { rows } = await pool.query(
            `UPDATE taxes SET ${updates.join(", ")}, updated_at = NOW()
             WHERE id = $${values.length} RETURNING *`, values
        );
        if (!rows.length) return res.status(404).json({ message: "Tax not found" });
        return res.json({ tax: rows[0] });
    } catch (error) {
        return databaseError(res, error, "Update tax failed:");
    }
};

export const deactivateTax = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid tax ID");
    try {
        const { rows } = await pool.query(
            "UPDATE taxes SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ message: "Tax not found" });
        return res.json({ message: "Tax deactivated" });
    } catch (error) {
        return databaseError(res, error, "Deactivate tax failed:");
    }
};

export const createDiscount = async (req, res) => {
    const error = validateDiscount(req.body);
    if (error) return invalid(res, error);
    const {
        name, type, value, min_purchase = 0, min_quantity = 1, valid_from = null,
        valid_to = null, usage_limit = null, applies_to, product_ids = [],
    } = req.body;
    if (applies_to === "PRODUCT" && product_ids.length === 0) return invalid(res, "Product discounts require product_ids");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const created = await client.query(
            `INSERT INTO discounts (name, type, value, min_purchase, min_quantity, valid_from, valid_to, usage_limit, applies_to)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [name.trim(), type, value, min_purchase, min_quantity, valid_from || null, valid_to || null, usage_limit, applies_to]
        );
        if (product_ids.length) await withProductTargets(client, created.rows[0].id, product_ids);
        await client.query("COMMIT");
        return res.status(201).json({ discount: { ...created.rows[0], product_ids } });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Create discount failed:");
    } finally {
        client.release();
    }
};

export const listDiscounts = async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return invalid(res, "page must be positive and limit must be between 1 and 100");
    }
    if (req.query.is_active !== undefined && !["true", "false"].includes(req.query.is_active)) {
        return invalid(res, "is_active must be true or false");
    }
    const values = [];
    const clauses = [];
    if (req.query.is_active !== undefined) {
        values.push(req.query.is_active === "true");
        clauses.push(`d.is_active = $${values.length}`);
    }
    if (req.query.search) {
        values.push(`%${String(req.query.search).trim()}%`);
        clauses.push(`d.name ILIKE $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    try {
        const count = await pool.query(`SELECT COUNT(*) FROM discounts d ${where}`, values);
        const { rows } = await pool.query(
            `SELECT d.*, COALESCE(ARRAY_AGG(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '{}') AS product_ids
             FROM discounts d LEFT JOIN discount_products dp ON dp.discount_id = d.id ${where}
             GROUP BY d.id ORDER BY d.created_at DESC
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, (page - 1) * limit]
        );
        return res.json({ discounts: rows, pagination: { page, limit, total: Number(count.rows[0].count) } });
    } catch (error) {
        return databaseError(res, error, "List discounts failed:");
    }
};

export const updateDiscount = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid discount ID");
    const error = validateDiscount(req.body, true);
    if (error) return invalid(res, error);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const current = await client.query("SELECT * FROM discounts WHERE id = $1 FOR UPDATE", [req.params.id]);
        if (!current.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Discount not found" });
        }
        const nextType = req.body.type ?? current.rows[0].type;
        const nextValue = req.body.value ?? current.rows[0].value;
        const nextScope = req.body.applies_to ?? current.rows[0].applies_to;
        if (nextType === "PERCENTAGE" && Number(nextValue) > 100) {
            await client.query("ROLLBACK");
            return invalid(res, "Percentage discounts cannot exceed 100");
        }
        const targets = Object.hasOwn(req.body, "product_ids")
            ? req.body.product_ids
            : (await client.query("SELECT product_id FROM discount_products WHERE discount_id = $1", [req.params.id])).rows.map((row) => row.product_id);
        if (nextScope === "PRODUCT" && targets.length === 0) {
            await client.query("ROLLBACK");
            return invalid(res, "Product discounts require product_ids");
        }
        const updates = [];
        const values = [];
        for (const field of ["name", "type", "value", "min_purchase", "min_quantity", "valid_from", "valid_to", "usage_limit", "applies_to", "is_active"]) {
            if (!Object.hasOwn(req.body, field)) continue;
            values.push(field === "name" ? req.body[field].trim() : (["valid_from", "valid_to"].includes(field) && req.body[field] === "" ? null : req.body[field]));
            updates.push(`${field} = $${values.length}`);
        }
        if (updates.length) {
            values.push(req.params.id);
            await client.query(
                `UPDATE discounts SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length}`, values
            );
        }
        if (Object.hasOwn(req.body, "product_ids") || nextScope !== current.rows[0].applies_to) {
            await withProductTargets(client, req.params.id, nextScope === "PRODUCT" ? targets : []);
        }
        await client.query("COMMIT");
        const result = await pool.query(
            `SELECT d.*, COALESCE(ARRAY_AGG(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '{}') AS product_ids
             FROM discounts d LEFT JOIN discount_products dp ON dp.discount_id = d.id
             WHERE d.id = $1 GROUP BY d.id`,
            [req.params.id]
        );
        return res.json({ discount: result.rows[0] });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Update discount failed:");
    } finally {
        client.release();
    }
};

export const deactivateDiscount = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid discount ID");
    try {
        const { rows } = await pool.query(
            "UPDATE discounts SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ message: "Discount not found" });
        return res.json({ message: "Discount deactivated" });
    } catch (error) {
        return databaseError(res, error, "Deactivate discount failed:");
    }
};

const subscriptionRow = async (queryable, subscriptionId, customerId = null, lock = false) => {
    const { rows } = await queryable.query(
        `SELECT s.*, s.start_date::text AS start_date, s.expiry_date::text AS expiry_date,
                u.name AS customer_name, u.email AS customer_email, pl.billing_cycle
         FROM subscriptions s JOIN users u ON u.id = s.customer_id
         JOIN plans pl ON pl.id = s.plan_id
         WHERE s.id = $1 AND ($2::bigint IS NULL OR s.customer_id = $2)
         ${lock ? "FOR UPDATE OF s" : ""}`,
        [subscriptionId, customerId]
    );
    return rows[0] ?? null;
};

const eligibleDiscount = async (client, discountId, subscription, items, lock = false) => {
    const result = await client.query(
        `SELECT d.* FROM discounts d WHERE d.id = $1 AND d.is_active = TRUE
         AND (d.valid_from IS NULL OR d.valid_from <= CURRENT_DATE)
         AND (d.valid_to IS NULL OR d.valid_to >= CURRENT_DATE)
         AND (d.usage_limit IS NULL OR d.used_count < d.usage_limit)
         ${lock ? "FOR UPDATE" : ""}`,
        [discountId]
    );
    if (!result.rows.length) return { error: "Discount is inactive, expired, or out of uses", status: 409 };
    const discount = result.rows[0];
    let eligibleItems = items;
    if (discount.applies_to === "PRODUCT") {
        const targets = await client.query("SELECT product_id FROM discount_products WHERE discount_id = $1", [discount.id]);
        const targetIds = new Set(targets.rows.map((row) => String(row.product_id)));
        eligibleItems = items.filter((item) => targetIds.has(String(item.product_id)));
        if (!eligibleItems.length) return { error: "Discount does not target subscription products", status: 400 };
    }
    const subtotalCents = eligibleItems.reduce((sum, item) => sum + centsFrom(item.amount), 0n);
    const quantity = eligibleItems.reduce((sum, item) => sum + Number(item.quantity), 0);
    if (subtotalCents < centsFrom(discount.min_purchase) || quantity < discount.min_quantity) {
        return { error: "Discount minimum purchase or quantity is not met", status: 400 };
    }
    return { discount, eligibleItems };
};

export const listSubscriptionDiscounts = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid subscription ID");
    try {
        const subscription = await subscriptionRow(pool, req.params.id, req.user.role === "CUSTOMER" ? req.user.id : null);
        if (!subscription) return res.status(404).json({ message: "Subscription not found" });
        const { rows } = await pool.query(
            `SELECT d.*, COALESCE(ARRAY_AGG(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '{}') AS product_ids
             FROM subscription_discounts sd JOIN discounts d ON d.id = sd.discount_id
             LEFT JOIN discount_products dp ON dp.discount_id = d.id
             WHERE sd.subscription_id = $1 GROUP BY d.id ORDER BY d.name`,
            [req.params.id]
        );
        return res.json({ discounts: rows });
    } catch (error) {
        return databaseError(res, error, "List subscription discounts failed:");
    }
};

export const applySubscriptionDiscount = async (req, res) => {
    if (!validId(req.params.id) || !validId(req.body.discount_id)) return invalid(res, "Valid subscription and discount IDs are required");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const subscription = await subscriptionRow(client, req.params.id, null, true);
        if (!subscription) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Subscription not found" });
        }
        if (!["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE"].includes(subscription.status)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Discounts cannot be changed on a closed subscription" });
        }
        const items = (await client.query(
            "SELECT product_id, quantity, amount FROM subscription_items WHERE subscription_id = $1", [req.params.id]
        )).rows;
        const eligibility = await eligibleDiscount(client, req.body.discount_id, subscription, items);
        if (eligibility.error) {
            await client.query("ROLLBACK");
            return res.status(eligibility.status).json({ message: eligibility.error });
        }
        const { rows } = await client.query(
            `INSERT INTO subscription_discounts (subscription_id, discount_id) VALUES ($1, $2)
             ON CONFLICT (subscription_id, discount_id) DO NOTHING RETURNING id`,
            [req.params.id, req.body.discount_id]
        );
        if (!rows.length) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Discount is already applied" });
        }
        await client.query("COMMIT");
        return res.status(201).json({ message: "Discount applied to subscription" });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Apply subscription discount failed:");
    } finally {
        client.release();
    }
};

export const removeSubscriptionDiscount = async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.discountId)) return invalid(res, "Invalid subscription or discount ID");
    try {
        const { rows } = await pool.query(
            `DELETE FROM subscription_discounts sd USING subscriptions s
             WHERE sd.subscription_id = s.id AND sd.subscription_id = $1 AND sd.discount_id = $2
             AND s.status IN ('DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE') RETURNING sd.id`,
            [req.params.id, req.params.discountId]
        );
        if (!rows.length) return res.status(404).json({ message: "Applied discount not found or subscription is closed" });
        return res.json({ message: "Discount removed from subscription" });
    } catch (error) {
        return databaseError(res, error, "Remove subscription discount failed:");
    }
};

const invoiceDetail = async (queryable, invoiceId, customerId = null) => {
    const { rows } = await queryable.query(
        `SELECT i.*, i.total - i.amount_paid AS outstanding,
                i.invoice_date::text AS invoice_date, i.due_date::text AS due_date,
                i.billing_period_start::text AS billing_period_start,
                i.billing_period_end::text AS billing_period_end,
                u.name AS customer_name, u.email AS customer_email,
                s.subscription_number, s.payment_terms
         FROM invoices i JOIN users u ON u.id = i.customer_id
         JOIN subscriptions s ON s.id = i.subscription_id
         WHERE i.id = $1 AND ($2::bigint IS NULL OR i.customer_id = $2)`,
        [invoiceId, customerId]
    );
    if (!rows.length) return null;
    const items = await queryable.query(
        `SELECT ii.*, p.name AS product_name FROM invoice_items ii
         JOIN products p ON p.id = ii.product_id WHERE ii.invoice_id = $1 ORDER BY ii.id`,
        [invoiceId]
    );
    return { ...rows[0], items: items.rows };
};

const distributeDiscount = (discountCents, eligibleIndexes, items) => {
    const eligibleSubtotal = eligibleIndexes.reduce((sum, index) => sum + items[index].remaining, 0n);
    if (discountCents <= 0n || eligibleSubtotal <= 0n) return;
    const allocations = eligibleIndexes.map((index) => ({
        index,
        amount: discountCents * items[index].remaining / eligibleSubtotal,
    }));
    let remaining = discountCents - allocations.reduce((sum, entry) => sum + entry.amount, 0n);
    for (const entry of allocations) {
        if (remaining === 0n) break;
        const capacity = items[entry.index].remaining - entry.amount;
        const extra = capacity < remaining ? capacity : remaining;
        entry.amount += extra;
        remaining -= extra;
    }
    for (const entry of allocations) {
        items[entry.index].remaining -= entry.amount;
        items[entry.index].discount += entry.amount;
    }
};

export const calculateInvoice = async (client, subscriptionId, subscriptionItems) => {
    const items = subscriptionItems.map((item) => {
        const base = centsFrom(item.amount);
        return {
            product_id: item.product_id,
            description: item.variant_name ? `${item.product_name} — ${item.variant_name}` : item.product_name,
            quantity: Number(item.quantity),
            unit_price: String(item.unit_price),
            tax_rate: String(item.tax_rate),
            base,
            remaining: base,
            discount: 0n,
            tax: 0n,
        };
    });
    const discounts = await client.query(
        "SELECT discount_id FROM subscription_discounts WHERE subscription_id = $1 ORDER BY discount_id",
        [subscriptionId]
    );
    for (const { discount_id: discountId } of discounts.rows) {
        const eligibility = await eligibleDiscount(client, discountId, null, items.map((item) => ({
            product_id: item.product_id, quantity: item.quantity, amount: moneyFromCents(item.remaining),
        })), true);
        if (eligibility.error) continue;
        const discount = eligibility.discount;
        const eligibleIds = new Set(eligibility.eligibleItems.map((item) => String(item.product_id)));
        const eligibleIndexes = items.map((item, index) => eligibleIds.has(String(item.product_id)) ? index : -1).filter((index) => index >= 0);
        const eligibleSubtotal = eligibleIndexes.reduce((sum, index) => sum + items[index].remaining, 0n);
        let amount = discount.type === "FIXED" ? centsFrom(discount.value) : percentageAmount(eligibleSubtotal, discount.value);
        if (amount > eligibleSubtotal) amount = eligibleSubtotal;
        if (amount <= 0n) continue;
        distributeDiscount(amount, eligibleIndexes, items);
        const usage = await client.query(
            `UPDATE discounts SET used_count = used_count + 1, updated_at = NOW()
             WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit)`,
            [discountId]
        );
        if (!usage.rowCount) throw Object.assign(new Error("Discount usage limit reached"), { code: "23505" });
    }
    let subtotal = 0n, discountTotal = 0n, taxTotal = 0n, total = 0n;
    for (const item of items) {
        subtotal += item.base;
        discountTotal += item.discount;
        item.tax = percentageAmount(item.remaining, item.tax_rate);
        taxTotal += item.tax;
        total += item.remaining + item.tax;
    }
    return {
        items,
        subtotal: moneyFromCents(subtotal),
        discountTotal: moneyFromCents(discountTotal),
        taxTotal: moneyFromCents(taxTotal),
        total: moneyFromCents(total),
    };
};

export const generateInvoice = async (req, res) => {
    const subscriptionId = req.params.subscriptionId;
    if (!validId(subscriptionId)) return invalid(res, "Invalid subscription ID");
    const periodStart = req.body.billing_period_start;
    const periodEnd = req.body.billing_period_end;
    if ((periodStart !== undefined && !validDate(periodStart)) || (periodEnd !== undefined && !validDate(periodEnd))) {
        return invalid(res, "Billing period dates must be valid YYYY-MM-DD dates");
    }
    if (periodStart && periodEnd && periodStart > periodEnd) return invalid(res, "Billing period start cannot be after end");
    const invoiceDate = req.body.invoice_date ?? new Date().toISOString().slice(0, 10);
    if (!validDate(invoiceDate)) return invalid(res, "invoice_date must be a valid YYYY-MM-DD date");
    const computedDue = req.body.due_date ?? (() => {
        const date = new Date(`${invoiceDate}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + 30);
        return date.toISOString().slice(0, 10);
    })();
    if (!validDate(computedDue) || computedDue < invoiceDate) return invalid(res, "due_date must be on or after invoice_date");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            `SELECT s.*, s.start_date::text AS start_date, s.next_billing_date::text AS next_billing_date,
                    pl.billing_cycle, u.id AS user_id
             FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id JOIN users u ON u.id = s.customer_id
             WHERE s.id = $1 FOR UPDATE OF s`,
            [subscriptionId]
        );
        if (!rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Subscription not found" });
        }
        const subscription = rows[0];
        if (subscription.status !== "ACTIVE") {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Invoices can only be generated for active subscriptions" });
        }
        const start = periodStart ?? subscription.start_date;
        const end = periodEnd ?? (subscription.next_billing_date
            ? await client.query("SELECT ($1::date - 1)::text AS end_date", [subscription.next_billing_date]).then((result) => result.rows[0].end_date)
            : start);
        if (start > end) {
            await client.query("ROLLBACK");
            return invalid(res, "Billing period start cannot be after end");
        }
        const source = await client.query(
            `SELECT si.*, p.name AS product_name, v.variant_name
             FROM subscription_items si JOIN products p ON p.id = si.product_id
             LEFT JOIN product_variants v ON v.id = si.variant_id
             WHERE si.subscription_id = $1 ORDER BY si.id`,
            [subscriptionId]
        );
        if (!source.rows.length) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Subscription has no billable items" });
        }
        const calculation = await calculateInvoice(client, subscriptionId, source.rows);
        const sequence = await client.query("SELECT nextval('invoice_number_seq') AS number");
        const invoiceNumber = `INV-${String(sequence.rows[0].number).padStart(6, "0")}`;
        const invoice = await client.query(
            `INSERT INTO invoices
             (invoice_number, subscription_id, customer_id, billing_period_start, billing_period_end,
              invoice_date, due_date, subtotal, tax_total, discount_total, total)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [invoiceNumber, subscriptionId, subscription.customer_id, start, end, invoiceDate, computedDue,
                calculation.subtotal, calculation.taxTotal, calculation.discountTotal, calculation.total]
        );
        for (const item of calculation.items) {
            await client.query(
                `INSERT INTO invoice_items
                 (invoice_id, product_id, description, quantity, unit_price, tax_rate, tax_amount, discount_amount, line_total)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [invoice.rows[0].id, item.product_id, item.description, item.quantity, item.unit_price,
                    item.tax_rate, moneyFromCents(item.tax), moneyFromCents(item.discount),
                    moneyFromCents(item.remaining + item.tax)]
            );
        }
        await client.query("COMMIT");
        return res.status(201).json({ invoice: await invoiceDetail(pool, invoice.rows[0].id) });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Generate invoice failed:");
    } finally {
        client.release();
    }
};

export const listInvoices = async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return invalid(res, "page must be positive and limit must be between 1 and 100");
    }
    if (req.query.status && !["DRAFT", "CONFIRMED", "PAID", "CANCELLED"].includes(req.query.status)) return invalid(res, "Invalid invoice status");
    const values = [];
    const clauses = [];
    if (req.user.role === "CUSTOMER") {
        values.push(req.user.id);
        clauses.push(`i.customer_id = $${values.length}`);
    }
    if (req.query.status) {
        values.push(req.query.status);
        clauses.push(`i.status = $${values.length}`);
    }
    if (req.query.search) {
        values.push(`%${String(req.query.search).trim()}%`);
        clauses.push(`(i.invoice_number ILIKE $${values.length} OR u.name ILIKE $${values.length} OR s.subscription_number ILIKE $${values.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    try {
        const count = await pool.query(
            `SELECT COUNT(*) FROM invoices i JOIN users u ON u.id = i.customer_id
             JOIN subscriptions s ON s.id = i.subscription_id ${where}`, values
        );
        const { rows } = await pool.query(
            `SELECT i.*, i.total - i.amount_paid AS outstanding,
                    i.invoice_date::text AS invoice_date, i.due_date::text AS due_date,
                    i.billing_period_start::text AS billing_period_start, i.billing_period_end::text AS billing_period_end,
                    u.name AS customer_name, s.subscription_number
             FROM invoices i JOIN users u ON u.id = i.customer_id
             JOIN subscriptions s ON s.id = i.subscription_id ${where}
             ORDER BY i.invoice_date DESC, i.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, (page - 1) * limit]
        );
        return res.json({ invoices: rows, pagination: { page, limit, total: Number(count.rows[0].count) } });
    } catch (error) {
        return databaseError(res, error, "List invoices failed:");
    }
};

export const getInvoice = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid invoice ID");
    try {
        const invoice = await invoiceDetail(pool, req.params.id, req.user.role === "CUSTOMER" ? req.user.id : null);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        return res.json({ invoice });
    } catch (error) {
        return databaseError(res, error, "Get invoice failed:");
    }
};

export const confirmInvoice = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid invoice ID");
    try {
        const { rows } = await pool.query(
            `UPDATE invoices SET status = 'CONFIRMED', updated_at = NOW()
             WHERE id = $1 AND status = 'DRAFT' RETURNING id`,
            [req.params.id]
        );
        if (!rows.length) {
            const found = await pool.query("SELECT status FROM invoices WHERE id = $1", [req.params.id]);
            if (!found.rows.length) return res.status(404).json({ message: "Invoice not found" });
            return res.status(409).json({ message: "Only draft invoices can be confirmed" });
        }
        return res.json({ invoice: await invoiceDetail(pool, req.params.id) });
    } catch (error) {
        return databaseError(res, error, "Confirm invoice failed:");
    }
};

export const cancelInvoice = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid invoice ID");
    try {
        const { rows } = await pool.query(
            `UPDATE invoices SET status = 'CANCELLED', updated_at = NOW()
             WHERE id = $1 AND status IN ('DRAFT', 'CONFIRMED') AND amount_paid = 0 RETURNING id`,
            [req.params.id]
        );
        if (!rows.length) {
            const found = await pool.query("SELECT status FROM invoices WHERE id = $1", [req.params.id]);
            if (!found.rows.length) return res.status(404).json({ message: "Invoice not found" });
            return res.status(409).json({ message: "Only unpaid draft or confirmed invoices can be cancelled" });
        }
        return res.json({ invoice: await invoiceDetail(pool, req.params.id) });
    } catch (error) {
        return databaseError(res, error, "Cancel invoice failed:");
    }
};

export const sendInvoice = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid invoice ID");
    try {
        const invoice = await invoiceDetail(pool, req.params.id);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        if (invoice.status !== "CONFIRMED") return res.status(409).json({ message: "Only confirmed invoices can be sent" });
        const lines = invoice.items.map((item) =>
            `<tr><td>${escapeHtml(item.description)}</td><td>${item.quantity}</td><td>₹${item.unit_price}</td><td>₹${item.line_total}</td></tr>`
        ).join("");
        const sent = await sendEmail({
            to: invoice.customer_email,
            subject: `Invoice ${invoice.invoice_number}`,
            html: `<p>Hello ${escapeHtml(invoice.customer_name)},</p><p>Please find invoice <strong>${escapeHtml(invoice.invoice_number)}</strong>, due ${escapeHtml(invoice.due_date)}.</p><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table><p>Subtotal: ₹${invoice.subtotal}<br>Discount: ₹${invoice.discount_total}<br>Tax: ₹${invoice.tax_total}<br><strong>Total: ₹${invoice.total}</strong></p>`,
        });
        if (!sent) return res.status(502).json({ message: "Invoice email could not be delivered; check SMTP configuration" });
        return res.json({ message: "Invoice sent" });
    } catch (error) {
        return databaseError(res, error, "Send invoice failed:");
    }
};

export const downloadInvoicePdf = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid invoice ID");
    try {
        const invoice = await invoiceDetail(pool, req.params.id, req.user.role === "CUSTOMER" ? req.user.id : null);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${invoice.invoice_number}.pdf"`);
        const document = new PDFDocument({ size: "A4", margin: 48 });
        document.on("error", (error) => {
            console.error("Create invoice PDF failed:", error);
            if (!res.headersSent) res.status(500).json({ message: "Could not generate invoice PDF" });
            else res.destroy(error);
        });
        document.pipe(res);
        document.fontSize(22).text("INVOICE", { align: "right" });
        document.moveDown();
        document.fontSize(11).text(pdfText(`Invoice: ${invoice.invoice_number}`));
        document.text(pdfText(`Date: ${invoice.invoice_date}    Due: ${invoice.due_date}`));
        document.text(pdfText(`Billing period: ${invoice.billing_period_start} to ${invoice.billing_period_end}`));
        document.moveDown();
        document.fontSize(14).text("Bill to");
        document.fontSize(11).text(pdfText(invoice.customer_name)).text(pdfText(invoice.customer_email));
        document.moveDown();
        document.fontSize(10).text("Description                         Qty        Unit price         Tax        Discount          Total");
        document.moveDown(0.5);
        for (const item of invoice.items) {
            document.text(pdfText(`${item.description}  |  ${item.quantity}  |  INR ${item.unit_price}  |  ${item.tax_rate}%  |  INR ${item.discount_amount}  |  INR ${item.line_total}`));
        }
        document.moveDown();
        document.fontSize(11).text(pdfText(`Subtotal: INR ${invoice.subtotal}`), { align: "right" });
        document.text(pdfText(`Discount: INR ${invoice.discount_total}`), { align: "right" });
        document.text(pdfText(`Tax: INR ${invoice.tax_total}`), { align: "right" });
        document.fontSize(15).text(pdfText(`Total: INR ${invoice.total}`), { align: "right" });
        document.moveDown();
        document.fontSize(10).text(`Status: ${invoice.status}`);
        document.end();
    } catch (error) {
        return databaseError(res, error, "Download invoice PDF failed:");
    }
};
