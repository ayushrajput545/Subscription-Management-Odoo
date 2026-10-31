
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
    getAllUsers,
    getUserById,
    createStaff,
    updateUser,
    deleteUser,
} from "../controllers/userController.js";

const router = express.Router();

// All user routes require ADMIN
router.post("/staff", protect, authorizeRoles("ADMIN"), createStaff);
router.get("/", protect, authorizeRoles("ADMIN"), getAllUsers);
router.get("/:id", protect, authorizeRoles("ADMIN"), getUserById);
router.patch("/:id", protect, authorizeRoles("ADMIN"), updateUser);
router.delete("/:id", protect, authorizeRoles("ADMIN"), deleteUser);

export default router;
