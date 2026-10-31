import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
    listNotifications, getUnreadNotificationCount, markNotificationRead,
    markAllNotificationsRead, listAdminNotifications, retryFailedNotification,
} from "../controllers/notificationController.js";

const router = express.Router();
const staffRoles = authorizeRoles("ADMIN", "STAFF");

router.get("/notifications/unread-count", protect, getUnreadNotificationCount);
router.get("/notifications", protect, listNotifications);
router.patch("/notifications/read-all", protect, markAllNotificationsRead);
router.patch("/notifications/:id/read", protect, markNotificationRead);
router.get("/admin/notifications", protect, staffRoles, listAdminNotifications);
router.post("/admin/notifications/:id/retry", protect, staffRoles, retryFailedNotification);

export default router;
