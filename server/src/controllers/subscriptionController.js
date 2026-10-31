import pool from "../config/db.js";

const idPattern = /^[1-9]\d*$/;
const statuses = ["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "CLOSED"];
const allowedTransitions = {
    DRAFT: ["QUOTATION"],
    QUOTATION: ["CONFIRMED"],
    CONFIRMED: ["ACTIVE"],
    ACTIVE: ["CLOSED"],
    CLOSED: [],
};
const validId = (value) => idPattern.test(String(value));
const validPrice = (value) => value !== "" && value !== null && value !== undefined &&
    Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 9999999999.99 &&
    /^\d+(\.\d{1,2})?$/.test(String(value));
const validDate = (value, nullable = false) => (nullable && (value === null || value === "")) ||
    (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const databaseDate = (value) => value instanceof Date
    ? value.toISOString().slice(0, 10)
    : typeof value === "string" ? value.slice(0, 10) : null;
const isName = (value) => typeof value === "string" && value.trim().length > 0;
const invalid = (res, message) => res.status(400).json({ message });
const databaseError = (res, error, context) => {
    if (error.code === "23505") return res.status(409).json({ message: "A record with these details already exists" });
    if (error.code === "23503" || error.code === "23001") return res.status(409).json({ message: "A referenced record is in use or does not exist" });
    if (["23514", "22P02", "22003"].includes(error.code)) return res.status(400).json({ message: "Invalid field value" });
    console.error(context, error);
    return res.status(500).json({ message: "Internal server error" });
};

const validateItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) return "At least one product item is required";
    if (items.length > 100) return "A maximum of 100 items is allowed";
    for (const [index, item] of items.entries()) {
        if (!item || typeof item !== "object" || Array.isArray(item)) return `Item ${index + 1} must be an object`;
        if (!validId(item.product_id)) return `Item ${index + 1} has an invalid product ID`;
        if (item.variant_id !== undefined && item.variant_id !== null && item.variant_id !== "" && !validId(item.variant_id)) {
            return `Item ${index + 1} has an invalid variant ID`;
        }
        if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 2147483647) {
            return `Item ${index + 1} quantity must be a positive integer`;
        }
        if (item.unit_price !== undefined && !validPrice(item.unit_price)) return `Item ${index + 1} unit price must be nonnegative with at most two decimals`;
        if (item.tax_rate !== undefined &&
            (!Number.isFinite(Number(item.tax_rate)) || Number(item.tax_rate) < 0 || Number(item.tax_rate) > 100 ||
                !/^\d+(\.\d{1,2})?$/.test(String(item.tax_rate)))) {
            return `Item ${index + 1} tax rate must be between 0 and 100`;
        }
    }
    return null;
};

const validateTemplate = (body, partial = false) => {
    if (!partial || Object.hasOwn(body, "name")) {
        if (!isName(body.name)) return "Name is required";
    }
    if (!partial || Object.hasOwn(body, "plan_id")) {
        if (!validId(body.plan_id)) return "A valid plan_id is required";
    }
    if (Object.hasOwn(body, "validity_days") &&
        (!Number.isInteger(Number(body.validity_days)) || Number(body.validity_days) < 1 || Number(body.validity_days) > 3650)) {
        return "validity_days must be between 1 and 3650";
    }
    if (Object.hasOwn(body, "items")) {
        const error = validateItems(body.items);
        if (error) return error;
    }
    if (partial && !["name", "plan_id", "validity_days", "items"].some((key) => Object.hasOwn(body, key))) {
        return "At least one template field is required";
    }
    return null;
};

const validateSubscription = (body, partial = false) => {
    if (!partial || Object.hasOwn(body, "customer_id")) {
        if (!validId(body.customer_id)) return "A valid customer_id is required";
    }
    if (!partial || Object.hasOwn(body, "plan_id")) {
        if (!validId(body.plan_id)) return "A valid plan_id is required";
    }
    if (!partial || Object.hasOwn(body, "start_date")) {
        if (!validDate(body.start_date)) return "A valid start_date is required";
    }
    if (Object.hasOwn(body, "expiry_date") && !validDate(body.expiry_date, true)) return "expiry_date must be a valid YYYY-MM-DD date or null";
    if (Object.hasOwn(body, "quotation_valid_until") && !validDate(body.quotation_valid_until, true)) {
        return "quotation_valid_until must be a valid YYYY-MM-DD date or null";
    }
    if (Object.hasOwn(body, "payment_terms") && body.payment_terms !== null && typeof body.payment_terms !== "string") {
        return "payment_terms must be text or null";
    }
    if (Object.hasOwn(body, "status") && !["DRAFT", "QUOTATION"].includes(body.status)) {
        return "New subscriptions may only be created as DRAFT or QUOTATION";
    }
    if (Object.hasOwn(body, "items")) {
        const error = validateItems(body.items);
        if (error) return error;
    } else if (!partial) {
        return "At least one product item is required";
    }
    if (partial && !["customer_id", "plan_id", "start_date", "expiry_date", "payment_terms", "items"].some((key) => Object.hasOwn(body, key))) {
        return "At least one subscription field is required";
    }
    const start = body.start_date;
    const expiry = body.expiry_date;
    if (start && expiry && expiry < start) return "expiry_date cannot be before start_date";
    return null;
};

const loadAndValidateItems = async (client, items) => {
    const normalized = [];
    for (const item of items) {
        const product = await client.query(
            `SELECT p.id, p.is_active, v.id AS variant_id,
                    (p.sales_price + COALESCE(v.extra_price, 0))::text AS calculated_price
             FROM products p
             LEFT JOIN product_variants v ON v.product_id = p.id AND v.id = $2
             WHERE p.id = $1`,
            [item.product_id, item.variant_id || null]
        );
        if (!product.rows.length || !product.rows[0].is_active) {
            return { error: "Product not found or inactive", status: 404 };
        }
        if (item.variant_id && !product.rows[0].variant_id) {
            return { error: "Variant does not belong to the selected product", status: 400 };
        }
        const price = String(item.unit_price === undefined ? product.rows[0].calculated_price : item.unit_price);
        const [whole, fraction = ""] = price.split(".");
        const unitCents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
        const amountCents = BigInt(item.quantity) * unitCents;
        if (amountCents > 999999999999n) {
            return { error: "Item amount exceeds the supported monetary range", status: 400 };
        }
        const formatCents = (cents) => `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
        normalized.push({
            product_id: item.product_id,
            variant_id: item.variant_id || null,
            quantity: Number(item.quantity),
            unit_price: formatCents(unitCents),
            tax_rate: Number(item.tax_rate ?? 0),
            amount: formatCents(amountCents),
        });
    }
    return { items: normalized };
};

const insertItems = async (client, subscriptionId, items) => {
    for (const item of items) {
        await client.query(
            `INSERT INTO subscription_items
             (subscription_id, product_id, variant_id, quantity, unit_price, tax_rate, amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [subscriptionId, item.product_id, item.variant_id, item.quantity, item.unit_price, item.tax_rate, item.amount]
        );
    }
};

const templateItems = async (client, templateId) => {
    const { rows } = await client.query(
        `SELECT ti.*, p.name AS product_name, v.variant_name
         FROM quotation_template_items ti
         JOIN products p ON p.id = ti.product_id
         LEFT JOIN product_variants v ON v.id = ti.variant_id
         WHERE ti.template_id = $1 ORDER BY ti.id`,
        [templateId]
    );
    return rows;
};

const replaceTemplateItems = async (client, templateId, items) => {
    const validated = await loadAndValidateItems(client, items);
    if (validated.error) return validated;
    await client.query("DELETE FROM quotation_template_items WHERE template_id = $1", [templateId]);
    for (const item of validated.items) {
        await client.query(
            `INSERT INTO quotation_template_items (template_id, product_id, variant_id, quantity, unit_price)
             VALUES ($1, $2, $3, $4, $5)`,
            [templateId, item.product_id, item.variant_id, item.quantity, item.unit_price]
        );
    }
    return { items: validated.items };
};

export const createQuotationTemplate = async (req, res) => {
    const error = validateTemplate(req.body);
    if (error) return invalid(res, error);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const plan = await client.query(
            `SELECT pl.id FROM plans pl JOIN products p ON p.id = pl.product_id
             WHERE pl.id = $1 AND pl.status = 'ACTIVE' AND p.is_active = TRUE`,
            [req.body.plan_id]
        );
        if (!plan.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Active plan not found" });
        }
        const created = await client.query(
            `INSERT INTO quotation_templates (name, plan_id, validity_days)
             VALUES ($1, $2, $3) RETURNING *`,
            [req.body.name.trim(), req.body.plan_id, req.body.validity_days ?? 30]
        );
        if (req.body.items) {
            const result = await replaceTemplateItems(client, created.rows[0].id, req.body.items);
            if (result.error) {
                await client.query("ROLLBACK");
                return res.status(result.status).json({ message: result.error });
            }
        }
        await client.query("COMMIT");
        const items = await templateItems(pool, created.rows[0].id);
        return res.status(201).json({ template: { ...created.rows[0], items } });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Create quotation template failed:");
    } finally {
        client.release();
    }
};

export const listQuotationTemplates = async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return invalid(res, "page must be positive and limit must be between 1 and 100");
    }
    const values = [];
    const clauses = [];
    if (req.query.search) {
        values.push(`%${String(req.query.search).trim()}%`);
        clauses.push(`(qt.name ILIKE $${values.length} OR pl.name ILIKE $${values.length} OR p.name ILIKE $${values.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    try {
        const count = await pool.query(
            `SELECT COUNT(*) FROM quotation_templates qt JOIN plans pl ON pl.id = qt.plan_id
             JOIN products p ON p.id = pl.product_id ${where}`, values
        );
        const { rows } = await pool.query(
            `SELECT qt.*, pl.name AS plan_name, pl.price AS plan_price, p.name AS product_name
             FROM quotation_templates qt JOIN plans pl ON pl.id = qt.plan_id
             JOIN products p ON p.id = pl.product_id ${where}
             ORDER BY qt.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, (page - 1) * limit]
        );
        return res.json({ templates: rows, pagination: { page, limit, total: Number(count.rows[0].count) } });
    } catch (error) {
        return databaseError(res, error, "List quotation templates failed:");
    }
};

export const getQuotationTemplate = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid template ID");
    try {
        const { rows } = await pool.query(
            `SELECT qt.*, pl.name AS plan_name, pl.price AS plan_price, pl.product_id AS plan_product_id,
                    pl.min_quantity,
                    p.name AS product_name
             FROM quotation_templates qt JOIN plans pl ON pl.id = qt.plan_id
             JOIN products p ON p.id = pl.product_id WHERE qt.id = $1`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ message: "Quotation template not found" });
        const items = await templateItems(pool, req.params.id);
        return res.json({ template: { ...rows[0], items } });
    } catch (error) {
        return databaseError(res, error, "Get quotation template failed:");
    }
};

export const updateQuotationTemplate = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid template ID");
    const error = validateTemplate(req.body, true);
    if (error) return invalid(res, error);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const current = await client.query("SELECT id FROM quotation_templates WHERE id = $1 FOR UPDATE", [req.params.id]);
        if (!current.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Quotation template not found" });
        }
        if (Object.hasOwn(req.body, "plan_id")) {
            const plan = await client.query(
                `SELECT pl.id FROM plans pl JOIN products p ON p.id = pl.product_id
                 WHERE pl.id = $1 AND pl.status = 'ACTIVE' AND p.is_active = TRUE`,
                [req.body.plan_id]
            );
            if (!plan.rows.length) {
                await client.query("ROLLBACK");
                return res.status(404).json({ message: "Active plan not found" });
            }
        }
        const assignments = [];
        const values = [];
        for (const key of ["name", "plan_id", "validity_days"]) {
            if (!Object.hasOwn(req.body, key)) continue;
            values.push(key === "name" ? req.body[key].trim() : req.body[key]);
            assignments.push(`${key} = $${values.length}`);
        }
        if (assignments.length) {
            values.push(req.params.id);
            await client.query(
                `UPDATE quotation_templates SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $${values.length}`,
                values
            );
        }
        if (Object.hasOwn(req.body, "items")) {
            const result = await replaceTemplateItems(client, req.params.id, req.body.items);
            if (result.error) {
                await client.query("ROLLBACK");
                return res.status(result.status).json({ message: result.error });
            }
        }
        await client.query("COMMIT");
        const { rows } = await pool.query(
            `SELECT qt.*, pl.name AS plan_name, pl.price AS plan_price, p.name AS product_name
             FROM quotation_templates qt JOIN plans pl ON pl.id = qt.plan_id
             JOIN products p ON p.id = pl.product_id WHERE qt.id = $1`,
            [req.params.id]
        );
        return res.json({ template: { ...rows[0], items: await templateItems(pool, req.params.id) } });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Update quotation template failed:");
    } finally {
        client.release();
    }
};

export const deleteQuotationTemplate = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid template ID");
    try {
        const { rows } = await pool.query("DELETE FROM quotation_templates WHERE id = $1 RETURNING id", [req.params.id]);
        if (!rows.length) return res.status(404).json({ message: "Quotation template not found" });
        return res.json({ message: "Quotation template deleted" });
    } catch (error) {
        return databaseError(res, error, "Delete quotation template failed:");
    }
};

const subscriptionSelect = `SELECT s.*, u.name AS customer_name, u.email AS customer_email,
    s.start_date::text AS start_date, s.expiry_date::text AS expiry_date,
    s.next_billing_date::text AS next_billing_date,
    s.quotation_valid_until::text AS quotation_valid_until,
    pl.name AS plan_name, pl.price AS plan_price, pl.billing_cycle, pl.min_quantity,
    pl.allow_early_close, pl.allow_renewal, pl.end_date::text AS plan_end_date,
    p.name AS product_name
    FROM subscriptions s JOIN users u ON u.id = s.customer_id
    JOIN plans pl ON pl.id = s.plan_id JOIN products p ON p.id = pl.product_id`;

const getSubscriptionDetail = async (queryable, id) => {
    const { rows } = await queryable.query(`${subscriptionSelect} WHERE s.id = $1`, [id]);
    if (!rows.length) return null;
    const { rows: items } = await queryable.query(
        `SELECT si.*, p.name AS product_name, v.variant_name
         FROM subscription_items si JOIN products p ON p.id = si.product_id
         LEFT JOIN product_variants v ON v.id = si.variant_id
         WHERE si.subscription_id = $1 ORDER BY si.id`,
        [id]
    );
    return { ...rows[0], items };
};

const validatePlanAndCustomer = async (client, planId, customerId, startDate, items) => {
    const planResult = await client.query(
        `SELECT pl.*, pl.start_date::text AS start_date, pl.end_date::text AS end_date,
                p.is_active AS product_is_active
         FROM plans pl JOIN products p ON p.id = pl.product_id WHERE pl.id = $1`,
        [planId]
    );
    if (!planResult.rows.length || planResult.rows[0].status !== "ACTIVE" || !planResult.rows[0].product_is_active) {
        return { error: "Active plan not found", status: 404 };
    }
    const plan = planResult.rows[0];
    if (plan.start_date && startDate < databaseDate(plan.start_date)) {
        return { error: "Subscription start date is before plan availability", status: 400 };
    }
    if (plan.end_date && startDate > databaseDate(plan.end_date)) {
        return { error: "Subscription start date is after plan availability", status: 400 };
    }
    const customer = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'CUSTOMER'", [customerId]);
    if (!customer.rows.length) return { error: "Customer not found", status: 404 };
    const normalized = await loadAndValidateItems(client, items);
    if (normalized.error) return normalized;
    const planProductQuantity = normalized.items
        .filter((item) => String(item.product_id) === String(plan.product_id))
        .reduce((sum, item) => sum + item.quantity, 0);
    if (planProductQuantity < plan.min_quantity) {
        return { error: `The plan product must be included with quantity at least ${plan.min_quantity}`, status: 400 };
    }
    return { plan, items: normalized.items };
};

const createSubscriptionRecord = async (client, body, items, status, quotationDays = 30) => {
    const { rows: sequence } = await client.query("SELECT nextval('subscription_number_seq') AS number");
    const subscriptionNumber = `SUB-${String(sequence[0].number).padStart(6, "0")}`;
    const quotationUntil = body.quotation_valid_until || null;
    const { rows } = await client.query(
        `INSERT INTO subscriptions
         (subscription_number, customer_id, plan_id, start_date, expiry_date, payment_terms,
          status, quotation_valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 CASE WHEN $7::varchar = 'QUOTATION' THEN COALESCE($8::date, CURRENT_DATE + $9::integer) ELSE NULL END)
         RETURNING id`,
        [subscriptionNumber, body.customer_id, body.plan_id, body.start_date, body.expiry_date || null,
            body.payment_terms ?? null, status, quotationUntil, quotationDays]
    );
    await insertItems(client, rows[0].id, items);
    return rows[0].id;
};

export const listSubscriptionCustomers = async (req, res) => {
    const search = String(req.query.search ?? "").trim();
    try {
        const { rows } = await pool.query(
            `SELECT id, name, email FROM users WHERE role = 'CUSTOMER'
             AND ($1 = '' OR name ILIKE $2 OR email ILIKE $2)
             ORDER BY name LIMIT 100`,
            [search, `%${search}%`]
        );
        return res.json({ customers: rows });
    } catch (error) {
        return databaseError(res, error, "List subscription customers failed:");
    }
};

export const createSubscription = async (req, res) => {
    const error = validateSubscription(req.body);
    if (error) return invalid(res, error);
    if (req.body.expiry_date && req.body.expiry_date < req.body.start_date) return invalid(res, "expiry_date cannot be before start_date");
    if (req.body.status === "QUOTATION" && req.body.quotation_valid_until &&
        req.body.quotation_valid_until < new Date().toISOString().slice(0, 10)) return invalid(res, "quotation_valid_until cannot be in the past");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const validated = await validatePlanAndCustomer(client, req.body.plan_id, req.body.customer_id, req.body.start_date, req.body.items);
        if (validated.error) {
            await client.query("ROLLBACK");
            return res.status(validated.status).json({ message: validated.error });
        }
        const id = await createSubscriptionRecord(client, req.body, validated.items, req.body.status ?? "DRAFT");
        await client.query("COMMIT");
        return res.status(201).json({ subscription: await getSubscriptionDetail(pool, id) });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Create subscription failed:");
    } finally {
        client.release();
    }
};

export const createSubscriptionFromTemplate = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid template ID");
    const body = req.body;
    if (!validId(body.customer_id)) return invalid(res, "A valid customer_id is required");
    if (!validDate(body.start_date)) return invalid(res, "A valid start_date is required");
    if (body.expiry_date !== undefined && !validDate(body.expiry_date, true)) return invalid(res, "Invalid expiry_date");
    if (body.payment_terms !== undefined && body.payment_terms !== null && typeof body.payment_terms !== "string") {
        return invalid(res, "payment_terms must be text or null");
    }
    if (Object.hasOwn(body, "items")) {
        const error = validateItems(body.items);
        if (error) return invalid(res, error);
    }
    if (body.expiry_date && body.expiry_date < body.start_date) return invalid(res, "expiry_date cannot be before start_date");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            `SELECT qt.*, pl.status AS plan_status, pl.min_quantity, pl.price AS plan_price,
                    p.is_active AS product_is_active, pl.product_id
             FROM quotation_templates qt JOIN plans pl ON pl.id = qt.plan_id
             JOIN products p ON p.id = pl.product_id WHERE qt.id = $1 FOR SHARE OF qt, pl`,
            [req.params.id]
        );
        if (!rows.length || rows[0].plan_status !== "ACTIVE" || !rows[0].product_is_active) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Active quotation template not found" });
        }
        const template = rows[0];
        const { rows: templateLines } = await client.query(
            `SELECT product_id, variant_id, quantity, unit_price
             FROM quotation_template_items WHERE template_id = $1 ORDER BY id`,
            [req.params.id]
        );
        const items = body.items ?? (templateLines.length ? templateLines : [{
            product_id: template.product_id, quantity: template.min_quantity, unit_price: undefined,
        }]);
        if (!items.some((item) => String(item.product_id) === String(template.product_id))) {
            items.push({
                product_id: template.product_id,
                quantity: template.min_quantity,
                unit_price: undefined,
            });
        }
        const validated = await validatePlanAndCustomer(
            client, template.plan_id, body.customer_id, body.start_date, items
        );
        if (validated.error) {
            await client.query("ROLLBACK");
            return res.status(validated.status).json({ message: validated.error });
        }
        const id = await createSubscriptionRecord(
            client, { ...body, plan_id: template.plan_id },
            validated.items, "QUOTATION", Number(template.validity_days)
        );
        await client.query("COMMIT");
        return res.status(201).json({ subscription: await getSubscriptionDetail(pool, id) });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Create subscription from template failed:");
    } finally {
        client.release();
    }
};

export const listSubscriptions = async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return invalid(res, "page must be positive and limit must be between 1 and 100");
    }
    if (req.query.status && !statuses.includes(req.query.status)) return invalid(res, "Invalid subscription status");
    const clauses = [];
    const values = [];
    if (req.user.role === "CUSTOMER") {
        values.push(req.user.id);
        clauses.push(`s.customer_id = $${values.length}`);
    }
    if (req.query.status) {
        values.push(req.query.status);
        clauses.push(`s.status = $${values.length}`);
    }
    if (req.query.search) {
        values.push(`%${String(req.query.search).trim()}%`);
        clauses.push(`(s.subscription_number ILIKE $${values.length} OR u.name ILIKE $${values.length} OR pl.name ILIKE $${values.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    try {
        const count = await pool.query(
            `SELECT COUNT(*) FROM subscriptions s JOIN users u ON u.id = s.customer_id
             JOIN plans pl ON pl.id = s.plan_id ${where}`, values
        );
        const { rows } = await pool.query(
            `${subscriptionSelect} ${where} ORDER BY s.created_at DESC, s.id DESC
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, (page - 1) * limit]
        );
        return res.json({ subscriptions: rows, pagination: { page, limit, total: Number(count.rows[0].count) } });
    } catch (error) {
        return databaseError(res, error, "List subscriptions failed:");
    }
};

export const getSubscription = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid subscription ID");
    try {
        const subscription = await getSubscriptionDetail(pool, req.params.id);
        if (!subscription || (req.user.role === "CUSTOMER" && subscription.customer_id !== req.user.id)) {
            return res.status(404).json({ message: "Subscription not found" });
        }
        return res.json({ subscription });
    } catch (error) {
        return databaseError(res, error, "Get subscription failed:");
    }
};

export const updateSubscription = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid subscription ID");
    const error = validateSubscription(req.body, true);
    if (error) return invalid(res, error);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const existing = await client.query(
            "SELECT s.*, s.start_date::text AS start_date, s.expiry_date::text AS expiry_date FROM subscriptions s WHERE s.id = $1 FOR UPDATE", [req.params.id]
        );
        if (!existing.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Subscription not found" });
        }
        if (!["DRAFT", "QUOTATION"].includes(existing.rows[0].status)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Only DRAFT or QUOTATION subscriptions can be edited" });
        }
        const current = existing.rows[0];
        const customerId = req.body.customer_id ?? current.customer_id;
        const planId = req.body.plan_id ?? current.plan_id;
        const startDate = req.body.start_date ?? databaseDate(current.start_date);
        const expiryDate = Object.hasOwn(req.body, "expiry_date") ? req.body.expiry_date : databaseDate(current.expiry_date);
        if (expiryDate && expiryDate < startDate) {
            await client.query("ROLLBACK");
            return invalid(res, "expiry_date cannot be before start_date");
        }
        const itemInput = req.body.items ?? (await client.query(
            "SELECT product_id, variant_id, quantity, unit_price, tax_rate FROM subscription_items WHERE subscription_id = $1",
            [req.params.id]
        )).rows;
        const validated = await validatePlanAndCustomer(client, planId, customerId, startDate, itemInput);
        if (validated.error) {
            await client.query("ROLLBACK");
            return res.status(validated.status).json({ message: validated.error });
        }
        await client.query(
            `UPDATE subscriptions SET customer_id = $1, plan_id = $2, start_date = $3,
             expiry_date = $4, payment_terms = $5, updated_at = NOW() WHERE id = $6`,
            [customerId, planId, startDate, expiryDate,
                Object.hasOwn(req.body, "payment_terms") ? req.body.payment_terms : current.payment_terms,
                req.params.id]
        );
        if (Object.hasOwn(req.body, "items")) {
            await client.query("DELETE FROM subscription_items WHERE subscription_id = $1", [req.params.id]);
            await insertItems(client, req.params.id, validated.items);
        }
        await client.query("COMMIT");
        return res.json({ subscription: await getSubscriptionDetail(pool, req.params.id) });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Update subscription failed:");
    } finally {
        client.release();
    }
};

export const updateSubscriptionStatus = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid subscription ID");
    if (!statuses.includes(req.body.status)) return invalid(res, "Invalid subscription status");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            `SELECT s.*, s.expiry_date::text AS expiry_date,
                    pl.billing_cycle, pl.allow_early_close, pl.allow_renewal
             FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
             WHERE s.id = $1 FOR UPDATE OF s`,
            [req.params.id]
        );
        if (!rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Subscription not found" });
        }
        const subscription = rows[0];
        if (!allowedTransitions[subscription.status].includes(req.body.status)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: `Invalid status transition: ${subscription.status} to ${req.body.status}` });
        }
        if (req.body.status === "CONFIRMED" && subscription.quotation_valid_until) {
            const valid = await client.query("SELECT $1::date >= CURRENT_DATE AS is_valid", [subscription.quotation_valid_until]);
            if (!valid.rows[0].is_valid) {
                await client.query("ROLLBACK");
                return res.status(409).json({ message: "Quotation has expired" });
            }
        }
        if (req.body.status === "CLOSED" && !subscription.allow_early_close &&
            (!subscription.expiry_date || databaseDate(subscription.expiry_date) > new Date().toISOString().slice(0, 10))) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "This plan does not allow early closure" });
        }
        if (req.body.status === "ACTIVE") {
            await client.query(
                `UPDATE subscriptions s SET status = 'ACTIVE',
                 next_billing_date = GREATEST(s.start_date, CURRENT_DATE) + CASE p.billing_cycle
                    WHEN 'DAILY' THEN INTERVAL '1 day'
                    WHEN 'WEEKLY' THEN INTERVAL '1 week'
                    WHEN 'MONTHLY' THEN INTERVAL '1 month'
                    WHEN 'YEARLY' THEN INTERVAL '1 year'
                 END, updated_at = NOW()
                 FROM plans p WHERE s.id = $1 AND p.id = s.plan_id`,
                [req.params.id]
            );
        } else {
            await client.query(
                "UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2",
                [req.body.status, req.params.id]
            );
        }
        await client.query("COMMIT");
        return res.json({ subscription: await getSubscriptionDetail(pool, req.params.id) });
    } catch (error) {
        await client.query("ROLLBACK");
        return databaseError(res, error, "Update subscription status failed:");
    } finally {
        client.release();
    }
};
