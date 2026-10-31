import pool from "../config/db.js";

const productTypes = ["SERVICE", "SOFTWARE", "OTHER"];
const billingCycles = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const planStatuses = ["ACTIVE", "PAUSED", "CLOSED"];
const positiveId = /^[1-9]\d*$/;
const productFields = {
    name: "name",
    type: "type",
    sales_price: "sales_price",
    cost_price: "cost_price",
    notes: "notes",
    is_active: "is_active",
};
const planFields = {
    name: "name",
    product_id: "product_id",
    price: "price",
    billing_cycle: "billing_cycle",
    min_quantity: "min_quantity",
    start_date: "start_date",
    end_date: "end_date",
    auto_close: "auto_close",
    allow_pause: "allow_pause",
    allow_early_close: "allow_early_close",
    allow_renewal: "allow_renewal",
    status: "status",
};

const invalid = (res, message) => res.status(400).json({ message });
const validId = (id) => positiveId.test(id);
const validPrice = (value) => {
    if (value === "" || value === null || value === undefined) return false;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 9999999999.99 &&
        /^\d+(\.\d{1,2})?$/.test(String(value));
};
const validDate = (value) => value === null || value === "" ||
    (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const databaseDate = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : value;
const validBoolean = (value) => typeof value === "boolean";
const normalizedName = (value) => typeof value === "string" && value.trim().length > 0;
const databaseError = (res, error, message) => {
    if (error.code === "23505") return res.status(409).json({ message: "A record with these details already exists" });
    if (error.code === "23503" || error.code === "23001") {
        return res.status(409).json({ message: "The referenced record is in use or does not exist" });
    }
    if (error.code === "23514" || error.code === "22P02" || error.code === "22003") {
        return res.status(400).json({ message: "Invalid field value" });
    }
    console.error(message, error);
    return res.status(500).json({ message: "Internal server error" });
};

const validateProduct = (body, partial = false) => {
    const fields = Object.keys(productFields).filter((field) => Object.hasOwn(body, field));
    if (!partial && (!normalizedName(body.name) || !productTypes.includes(body.type) ||
        !validPrice(body.sales_price) || !validPrice(body.cost_price))) {
        return "Name, valid type, sales price, and cost price are required";
    }
    if (partial && fields.length === 0) return "At least one product field is required";
    if (Object.hasOwn(body, "name") && !normalizedName(body.name)) return "Name is required";
    if (Object.hasOwn(body, "type") && !productTypes.includes(body.type)) return "Invalid product type";
    for (const field of ["sales_price", "cost_price"]) {
        if (Object.hasOwn(body, field) && !validPrice(body[field])) return `${field} must be a nonnegative amount with at most two decimals`;
    }
    if (Object.hasOwn(body, "notes") && body.notes !== null && typeof body.notes !== "string") return "Notes must be text or null";
    if (Object.hasOwn(body, "is_active") && !validBoolean(body.is_active)) return "is_active must be a boolean";
    return null;
};

const validatePlan = (body, partial = false) => {
    const fields = Object.keys(planFields).filter((field) => Object.hasOwn(body, field));
    if (!partial && (!normalizedName(body.name) || !validId(String(body.product_id)) ||
        !validPrice(body.price) || !billingCycles.includes(body.billing_cycle))) {
        return "Name, product, valid price, and billing cycle are required";
    }
    if (partial && fields.length === 0) return "At least one plan field is required";
    if (Object.hasOwn(body, "name") && !normalizedName(body.name)) return "Name is required";
    if (Object.hasOwn(body, "product_id") && !validId(String(body.product_id))) return "Invalid product ID";
    if (Object.hasOwn(body, "price") && !validPrice(body.price)) return "Price must be a nonnegative amount with at most two decimals";
    if (Object.hasOwn(body, "billing_cycle") && !billingCycles.includes(body.billing_cycle)) return "Invalid billing cycle";
    if (Object.hasOwn(body, "min_quantity") &&
        (!Number.isInteger(Number(body.min_quantity)) || Number(body.min_quantity) < 1)) return "Minimum quantity must be a positive integer";
    if (Object.hasOwn(body, "status") && !planStatuses.includes(body.status)) return "Invalid plan status";
    for (const field of ["start_date", "end_date"]) {
        if (Object.hasOwn(body, field) && !validDate(body[field])) return `${field} must be a valid YYYY-MM-DD date or null`;
    }
    for (const field of ["auto_close", "allow_pause", "allow_early_close", "allow_renewal"]) {
        if (Object.hasOwn(body, field) && !validBoolean(body[field])) return `${field} must be a boolean`;
    }
    const start = Object.hasOwn(body, "start_date") ? body.start_date : undefined;
    const end = Object.hasOwn(body, "end_date") ? body.end_date : undefined;
    if (start && end && start > end) return "start_date cannot be after end_date";
    return null;
};

const buildUpdate = (body, fields) => {
    const entries = Object.entries(fields).filter(([field]) => Object.hasOwn(body, field));
    return {
        assignments: entries.map(([field, column], index) => `${column} = $${index + 1}`),
        values: entries.map(([field]) => {
            const value = body[field];
            if (["name"].includes(field) && typeof value === "string") return value.trim();
            if (["start_date", "end_date", "notes"].includes(field) && value === "") return null;
            return value;
        }),
    };
};

export const createProduct = async (req, res) => {
    const error = validateProduct(req.body);
    if (error) return invalid(res, error);
    const { name, type, sales_price, cost_price, notes = null } = req.body;
    try {
        const { rows } = await pool.query(
            `INSERT INTO products (name, type, sales_price, cost_price, notes)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name.trim(), type, sales_price, cost_price, notes]
        );
        return res.status(201).json({ product: rows[0] });
    } catch (err) {
        return databaseError(res, err, "Create product failed:");
    }
};

export const listProducts = async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return invalid(res, "page must be positive and limit must be between 1 and 100");
    }
    if (req.query.is_active !== undefined && !["true", "false"].includes(req.query.is_active)) {
        return invalid(res, "is_active must be true or false");
    }
    const clauses = [];
    const values = [];
    if (req.user.role !== "ADMIN") clauses.push("is_active = TRUE");
    else if (req.query.is_active !== undefined) {
        values.push(req.query.is_active === "true");
        clauses.push(`is_active = $${values.length}`);
    }
    if (req.query.search) {
        values.push(`%${String(req.query.search).trim()}%`);
        clauses.push(`(name ILIKE $${values.length} OR type ILIKE $${values.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    try {
        const count = await pool.query(`SELECT COUNT(*) FROM products ${where}`, values);
        const offset = (page - 1) * limit;
        const { rows } = await pool.query(
            `SELECT * FROM products ${where} ORDER BY created_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, offset]
        );
        return res.json({ products: rows, pagination: { page, limit, total: Number(count.rows[0].count) } });
    } catch (err) {
        return databaseError(res, err, "List products failed:");
    }
};

export const getProduct = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid product ID");
    try {
        const { rows } = await pool.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
        if (!rows.length || (req.user.role !== "ADMIN" && !rows[0].is_active)) {
            return res.status(404).json({ message: "Product not found" });
        }
        return res.json({ product: rows[0] });
    } catch (err) {
        return databaseError(res, err, "Get product failed:");
    }
};

export const updateProduct = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid product ID");
    const error = validateProduct(req.body, true);
    if (error) return invalid(res, error);
    const { assignments, values } = buildUpdate(req.body, productFields);
    values.push(req.params.id);
    try {
        const { rows } = await pool.query(
            `UPDATE products SET ${assignments.join(", ")}, updated_at = NOW()
             WHERE id = $${values.length} RETURNING *`,
            values
        );
        if (!rows.length) return res.status(404).json({ message: "Product not found" });
        return res.json({ product: rows[0] });
    } catch (err) {
        return databaseError(res, err, "Update product failed:");
    }
};

export const deactivateProduct = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid product ID");
    try {
        const { rows } = await pool.query(
            "UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id",
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ message: "Product not found" });
        return res.json({ message: "Product deactivated" });
    } catch (err) {
        return databaseError(res, err, "Deactivate product failed:");
    }
};

const productExists = async (productId) => {
    const { rows } = await pool.query("SELECT id FROM products WHERE id = $1", [productId]);
    return rows.length > 0;
};

export const createVariant = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid product ID");
    const { variant_name, extra_price = 0 } = req.body;
    if (!normalizedName(variant_name) || !validPrice(extra_price)) {
        return invalid(res, "Variant name and a nonnegative extra price are required");
    }
    try {
        if (!await productExists(req.params.id)) return res.status(404).json({ message: "Product not found" });
        const { rows } = await pool.query(
            `INSERT INTO product_variants (product_id, variant_name, extra_price)
             VALUES ($1, $2, $3)
             RETURNING *, (SELECT sales_price FROM products WHERE id = product_id) + extra_price AS price`,
            [req.params.id, variant_name.trim(), extra_price]
        );
        return res.status(201).json({ variant: rows[0] });
    } catch (err) {
        return databaseError(res, err, "Create variant failed:");
    }
};

export const listVariants = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid product ID");
    try {
        const product = await pool.query("SELECT id, sales_price, is_active FROM products WHERE id = $1", [req.params.id]);
        if (!product.rows.length || (req.user.role !== "ADMIN" && !product.rows[0].is_active)) {
            return res.status(404).json({ message: "Product not found" });
        }
        const { rows } = await pool.query(
            `SELECT v.*, p.sales_price + v.extra_price AS price
             FROM product_variants v JOIN products p ON p.id = v.product_id
             WHERE v.product_id = $1 ORDER BY v.id`,
            [req.params.id]
        );
        return res.json({ variants: rows });
    } catch (err) {
        return databaseError(res, err, "List variants failed:");
    }
};

export const updateVariant = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid variant ID");
    const fields = Object.keys(req.body);
    if (!fields.length || fields.some((field) => !["variant_name", "extra_price"].includes(field))) {
        return invalid(res, "Provide variant_name and/or extra_price");
    }
    if (Object.hasOwn(req.body, "variant_name") && !normalizedName(req.body.variant_name)) return invalid(res, "Variant name is required");
    if (Object.hasOwn(req.body, "extra_price") && !validPrice(req.body.extra_price)) return invalid(res, "Extra price must be nonnegative with at most two decimals");
    const { assignments, values } = buildUpdate(req.body, { variant_name: "variant_name", extra_price: "extra_price" });
    if (Object.hasOwn(req.body, "variant_name")) values[0] = values[0].trim();
    values.push(req.params.id);
    try {
        const { rows } = await pool.query(
            `UPDATE product_variants v SET ${assignments.join(", ")}
             FROM products p WHERE v.id = $${values.length} AND p.id = v.product_id
             RETURNING v.*, p.sales_price + v.extra_price AS price`,
            values
        );
        if (!rows.length) return res.status(404).json({ message: "Variant not found" });
        return res.json({ variant: rows[0] });
    } catch (err) {
        return databaseError(res, err, "Update variant failed:");
    }
};

export const deleteVariant = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid variant ID");
    try {
        const { rows } = await pool.query("DELETE FROM product_variants WHERE id = $1 RETURNING id", [req.params.id]);
        if (!rows.length) return res.status(404).json({ message: "Variant not found" });
        return res.json({ message: "Variant deleted" });
    } catch (err) {
        return databaseError(res, err, "Delete variant failed:");
    }
};

const planSelect = `SELECT pl.*, p.name AS product_name, p.type AS product_type,
    p.sales_price AS product_sales_price, p.is_active AS product_is_active
    FROM plans pl JOIN products p ON p.id = pl.product_id`;

export const createPlan = async (req, res) => {
    const error = validatePlan(req.body);
    if (error) return invalid(res, error);
    const { name, product_id, price, billing_cycle, min_quantity = 1, start_date = null, end_date = null,
        auto_close = false, allow_pause = true, allow_early_close = true, allow_renewal = true, status = "ACTIVE" } = req.body;
    try {
        if (!await productExists(product_id)) return res.status(404).json({ message: "Product not found" });
        const { rows } = await pool.query(
            `INSERT INTO plans
             (name, product_id, price, billing_cycle, min_quantity, start_date, end_date,
              auto_close, allow_pause, allow_early_close, allow_renewal, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [name.trim(), product_id, price, billing_cycle, min_quantity, start_date || null, end_date || null,
                auto_close, allow_pause, allow_early_close, allow_renewal, status]
        );
        const detail = await pool.query(`${planSelect} WHERE pl.id = $1`, [rows[0].id]);
        return res.status(201).json({ plan: detail.rows[0] });
    } catch (err) {
        return databaseError(res, err, "Create plan failed:");
    }
};

export const listPlans = async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return invalid(res, "page must be positive and limit must be between 1 and 100");
    }
    if (req.query.status !== undefined && !planStatuses.includes(req.query.status)) return invalid(res, "Invalid plan status");
    const clauses = [];
    const values = [];
    if (req.user.role === "CUSTOMER") clauses.push("pl.status = 'ACTIVE' AND p.is_active = TRUE");
    else if (req.query.status) {
        values.push(req.query.status);
        clauses.push(`pl.status = $${values.length}`);
    }
    if (req.query.search) {
        values.push(`%${String(req.query.search).trim()}%`);
        clauses.push(`(pl.name ILIKE $${values.length} OR p.name ILIKE $${values.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    try {
        const count = await pool.query(
            `SELECT COUNT(*) FROM plans pl JOIN products p ON p.id = pl.product_id ${where}`, values
        );
        const { rows } = await pool.query(
            `${planSelect} ${where} ORDER BY pl.created_at DESC, pl.id DESC
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, (page - 1) * limit]
        );
        return res.json({ plans: rows, pagination: { page, limit, total: Number(count.rows[0].count) } });
    } catch (err) {
        return databaseError(res, err, "List plans failed:");
    }
};

export const getPlan = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid plan ID");
    try {
        const { rows } = await pool.query(`${planSelect} WHERE pl.id = $1`, [req.params.id]);
        if (!rows.length || (req.user.role === "CUSTOMER" && (rows[0].status !== "ACTIVE" || !rows[0].product_is_active))) {
            return res.status(404).json({ message: "Plan not found" });
        }
        return res.json({ plan: rows[0] });
    } catch (err) {
        return databaseError(res, err, "Get plan failed:");
    }
};

export const updatePlan = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid plan ID");
    const error = validatePlan(req.body, true);
    if (error) return invalid(res, error);
    const { assignments, values } = buildUpdate(req.body, planFields);
    try {
        const productId = Object.hasOwn(req.body, "product_id") ? req.body.product_id : null;
        if (productId && !await productExists(productId)) return res.status(404).json({ message: "Product not found" });
        const existing = await pool.query("SELECT start_date, end_date FROM plans WHERE id = $1", [req.params.id]);
        if (!existing.rows.length) return res.status(404).json({ message: "Plan not found" });
        const start = Object.hasOwn(req.body, "start_date") ? req.body.start_date : databaseDate(existing.rows[0].start_date);
        const end = Object.hasOwn(req.body, "end_date") ? req.body.end_date : databaseDate(existing.rows[0].end_date);
        if (start && end && start > end) return invalid(res, "start_date cannot be after end_date");
        values.push(req.params.id);
        const { rows } = await pool.query(
            `UPDATE plans SET ${assignments.join(", ")}, updated_at = NOW()
             WHERE id = $${values.length} RETURNING id`,
            values
        );
        if (!rows.length) return res.status(404).json({ message: "Plan not found" });
        const detail = await pool.query(`${planSelect} WHERE pl.id = $1`, [req.params.id]);
        return res.json({ plan: detail.rows[0] });
    } catch (err) {
        return databaseError(res, err, "Update plan failed:");
    }
};

export const updatePlanStatus = async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, "Invalid plan ID");
    if (!planStatuses.includes(req.body.status)) return invalid(res, "Status must be ACTIVE, PAUSED, or CLOSED");
    try {
        const { rows } = await pool.query(
            "UPDATE plans SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
            [req.body.status, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ message: "Plan not found" });
        const detail = await pool.query(`${planSelect} WHERE pl.id = $1`, [req.params.id]);
        return res.json({ plan: detail.rows[0] });
    } catch (err) {
        return databaseError(res, err, "Update plan status failed:");
    }
};
