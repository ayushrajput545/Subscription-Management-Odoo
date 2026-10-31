import pool from "../config/db.js";
import { calculateInvoice } from "../controllers/invoiceController.js";
import { notifyBillingFailure, notifyInvoiceCreated } from "../utils/notificationService.js";
import { getNotificationIntervalMs, runNotifications } from "./notificationJob.js";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const configuredInterval = Number(process.env.BILLING_INTERVAL_MS);
const intervalMs = Number.isSafeInteger(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_INTERVAL_MS;

const runState = {
    running: false,
    lastRunAt: null,
    lastRunFinishedAt: null,
    processedCount: 0,
    successCount: 0,
    failureCount: 0,
    recentFailures: [],
};
let timer;
let nextBillingRunMs;
let nextNotificationRunMs;

const dateValue = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const dateString = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
    const result = dateValue(date);
    result.setUTCDate(result.getUTCDate() + days);
    return dateString(result);
};
const endOfMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export const advanceBillingDate = (nextDate, cycle, anchorDate = nextDate) => {
    const current = dateValue(nextDate);
    const anchor = dateValue(anchorDate);
    if (cycle === "DAILY") current.setUTCDate(current.getUTCDate() + 1);
    else if (cycle === "WEEKLY") current.setUTCDate(current.getUTCDate() + 7);
    else if (cycle === "MONTHLY") {
        const target = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
        target.setUTCDate(Math.min(anchor.getUTCDate(), endOfMonth(target.getUTCFullYear(), target.getUTCMonth())));
        return dateString(target);
    } else if (cycle === "YEARLY") {
        const year = current.getUTCFullYear() + 1;
        const month = anchor.getUTCMonth();
        return dateString(new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(), endOfMonth(year, month)))));
    } else {
        throw new Error(`Unsupported billing cycle: ${cycle}`);
    }
    return dateString(current);
};

const moneyFromCents = (value) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;

const updateAfterBilling = async (client, subscription, periodStart, periodEnd, nextBillingDate) => {
    const expired = subscription.expiry_date && subscription.expiry_date < nextBillingDate;
    if (expired && subscription.auto_close) {
        await client.query(
            `UPDATE subscriptions SET last_billed_period_start = $1, last_billed_period_end = $2,
                    next_billing_date = NULL, status = 'CLOSED', updated_at = NOW()
             WHERE id = $3`,
            [periodStart, periodEnd, subscription.id]
        );
    } else {
        await client.query(
            `UPDATE subscriptions SET last_billed_period_start = $1, last_billed_period_end = $2,
                    next_billing_date = $3, updated_at = NOW()
             WHERE id = $4`,
            [periodStart, periodEnd, expired ? null : nextBillingDate, subscription.id]
        );
    }
};

const closeOrStopExpired = async (client, subscription) => {
    if (subscription.auto_close) {
        await client.query(
            "UPDATE subscriptions SET status = 'CLOSED', next_billing_date = NULL, updated_at = NOW() WHERE id = $1",
            [subscription.id]
        );
    } else {
        await client.query(
            "UPDATE subscriptions SET next_billing_date = NULL, updated_at = NOW() WHERE id = $1",
            [subscription.id]
        );
    }
};

const processDueCycle = async (subscriptionId) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            `SELECT s.id, s.customer_id, s.plan_id, s.start_date::text AS start_date,
                    s.expiry_date::text AS expiry_date,
                    s.next_billing_date::text AS next_billing_date,
                    s.last_billed_period_end::text AS last_billed_period_end,
                    p.billing_cycle, p.auto_close
             FROM subscriptions s JOIN plans p ON p.id = s.plan_id
             WHERE s.id = $1 AND s.status = 'ACTIVE'
               AND s.next_billing_date <= CURRENT_DATE
             FOR UPDATE OF s SKIP LOCKED`,
            [subscriptionId]
        );
        if (!result.rows.length) {
            await client.query("ROLLBACK");
            return { kind: "not_due" };
        }
        const subscription = result.rows[0];
        const periodStart = subscription.last_billed_period_end
            ? addDays(subscription.last_billed_period_end, 1)
            : subscription.start_date;
        const periodEnd = subscription.expiry_date && subscription.expiry_date < addDays(subscription.next_billing_date, -1)
            ? subscription.expiry_date
            : addDays(subscription.next_billing_date, -1);

        if (subscription.expiry_date && subscription.expiry_date < periodStart) {
            await closeOrStopExpired(client, subscription);
            await client.query("COMMIT");
            return { kind: "expired" };
        }
        if (periodEnd < periodStart) {
            await closeOrStopExpired(client, subscription);
            await client.query("COMMIT");
            return { kind: "expired" };
        }

        const nextBillingDate = advanceBillingDate(
            subscription.next_billing_date,
            subscription.billing_cycle,
            subscription.start_date
        );
        const previousInvoice = await client.query(
            `SELECT id, invoice_number FROM invoices
             WHERE subscription_id = $1 AND billing_period_start = $2 AND billing_period_end = $3`,
            [subscription.id, periodStart, periodEnd]
        );
        if (previousInvoice.rows.length) {
            await updateAfterBilling(client, subscription, periodStart, periodEnd, nextBillingDate);
            await client.query("COMMIT");
            return { kind: "existing", invoiceNumber: previousInvoice.rows[0].invoice_number };
        }

        const source = await client.query(
            `SELECT si.*, p.name AS product_name, v.variant_name
             FROM subscription_items si JOIN products p ON p.id = si.product_id
             LEFT JOIN product_variants v ON v.id = si.variant_id
             WHERE si.subscription_id = $1 ORDER BY si.id`,
            [subscription.id]
        );
        if (!source.rows.length) throw Object.assign(new Error("Active subscription has no billable items"), { code: "NO_BILLABLE_ITEMS" });

        const calculation = await calculateInvoice(client, subscription.id, source.rows);
        const sequence = await client.query("SELECT nextval('invoice_number_seq') AS number");
        const invoiceNumber = `INV-${String(sequence.rows[0].number).padStart(6, "0")}`;
        const invoiceDate = (await client.query("SELECT CURRENT_DATE::text AS date")).rows[0].date;
        const dueDate = (await client.query("SELECT (CURRENT_DATE + 30)::text AS date")).rows[0].date;
        const invoice = await client.query(
            `INSERT INTO invoices
             (invoice_number, subscription_id, customer_id, billing_period_start, billing_period_end,
              invoice_date, due_date, subtotal, tax_total, discount_total, total)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id`,
            [invoiceNumber, subscription.id, subscription.customer_id, periodStart, periodEnd,
                invoiceDate, dueDate, calculation.subtotal, calculation.taxTotal,
                calculation.discountTotal, calculation.total]
        );
        for (const item of calculation.items) {
            await client.query(
                `INSERT INTO invoice_items
                 (invoice_id, product_id, description, quantity, unit_price, tax_rate,
                  tax_amount, discount_amount, line_total)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                [invoice.rows[0].id, item.product_id, item.description, item.quantity, item.unit_price,
                    item.tax_rate, moneyFromCents(item.tax), moneyFromCents(item.discount),
                    moneyFromCents(item.remaining + item.tax)]
            );
        }
        await updateAfterBilling(client, subscription, periodStart, periodEnd, nextBillingDate);
        await client.query("COMMIT");
        return { kind: "generated", invoiceId: invoice.rows[0].id, invoiceNumber, periodStart, periodEnd };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const getBillingRunStatus = () => ({
    ...runState,
    scheduleIntervalMs: intervalMs,
});

export const getBillingIntervalMs = () => intervalMs;

export const runBilling = async (source = "manual") => {
    if (runState.running) return { started: false, ...getBillingRunStatus() };
    runState.running = true;
    runState.lastRunAt = new Date().toISOString();
    runState.processedCount = 0;
    runState.successCount = 0;
    runState.failureCount = 0;
    runState.recentFailures = [];
    console.log("Recurring billing run started", { source });

    try {
        const { rows } = await pool.query(
            `SELECT id FROM subscriptions
             WHERE status = 'ACTIVE' AND next_billing_date <= CURRENT_DATE
             ORDER BY next_billing_date, id`
        );
        for (const { id } of rows) {
            let subscriptionProcessed = false;
            while (true) {
                try {
                    const result = await processDueCycle(id);
                    if (result.kind === "not_due") break;
                    subscriptionProcessed = true;
                    if (result.kind === "generated") {
                        runState.successCount += 1;
                        await notifyInvoiceCreated(result.invoiceId);
                        console.log("Recurring invoice generated", {
                            subscriptionId: id,
                            invoiceNumber: result.invoiceNumber,
                            periodStart: result.periodStart,
                            periodEnd: result.periodEnd,
                        });
                    }
                    if (result.kind === "existing") {
                        console.log("Recurring billing matched existing invoice", {
                            subscriptionId: id,
                            invoiceNumber: result.invoiceNumber,
                        });
                    }
                    if (result.kind === "expired") break;
                } catch (error) {
                    subscriptionProcessed = true;
                    runState.failureCount += 1;
                    runState.recentFailures = [
                        ...runState.recentFailures.slice(-9),
                        { subscriptionId: String(id), code: error.code ?? "PROCESSING_ERROR" },
                    ];
                    console.error("Recurring billing failed for subscription", {
                        subscriptionId: id,
                        code: error.code ?? "PROCESSING_ERROR",
                    });
                    await notifyBillingFailure(id, error.code ?? "PROCESSING_ERROR");
                    break;
                }
            }
            if (subscriptionProcessed) runState.processedCount += 1;
        }
    } catch (error) {
        runState.failureCount += 1;
        runState.recentFailures = [{ subscriptionId: null, code: error.code ?? "BILLING_RUN_ERROR" }];
        console.error("Recurring billing run failed", { code: error.code ?? "BILLING_RUN_ERROR" });
    } finally {
        runState.running = false;
        runState.lastRunFinishedAt = new Date().toISOString();
        console.log("Recurring billing run finished", {
            source,
            processedCount: runState.processedCount,
            successCount: runState.successCount,
            failureCount: runState.failureCount,
        });
    }
    return { started: true, ...getBillingRunStatus() };
};

export const startRecurringBillingJob = () => {
    if (timer) return;
    const notificationIntervalMs = getNotificationIntervalMs();
    nextBillingRunMs = Date.now() + intervalMs;
    nextNotificationRunMs = Date.now() + notificationIntervalMs;
    const scheduleNext = () => {
        const nextRunAt = Math.min(nextBillingRunMs, nextNotificationRunMs);
        timer = setTimeout(() => {
            const now = Date.now();
            if (now >= nextBillingRunMs) {
                nextBillingRunMs = now + intervalMs;
                void runBilling("scheduled");
            }
            if (now >= nextNotificationRunMs) {
                nextNotificationRunMs = now + notificationIntervalMs;
                void runNotifications();
            }
            scheduleNext();
        }, Math.max(0, nextRunAt - Date.now()));
        timer.unref();
    };
    scheduleNext();
    console.log("Recurring billing schedule enabled", { intervalMs, notificationIntervalMs });
};
