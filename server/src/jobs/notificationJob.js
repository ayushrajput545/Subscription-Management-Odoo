import { runNotificationReminders, runNotificationRetries } from "../utils/notificationService.js";

const configuredInterval = Number(process.env.NOTIFICATION_INTERVAL_MS);
const intervalMs = Number.isSafeInteger(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : 60 * 60 * 1000;
let running = false;
let lastRunAt = null;

export const runNotifications = async () => {
    if (running) return false;
    running = true;
    lastRunAt = new Date().toISOString();
    try {
        await runNotificationRetries();
        await runNotificationReminders();
        return true;
    } catch (error) {
        console.error("Notification run failed", { code: error.code ?? "NOTIFICATION_RUN_ERROR" });
        return false;
    } finally {
        running = false;
    }
};

export const getNotificationJobStatus = () => ({ running, lastRunAt, intervalMs });

export const getNotificationIntervalMs = () => intervalMs;
