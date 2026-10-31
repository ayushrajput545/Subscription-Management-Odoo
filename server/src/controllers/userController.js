
import pool from "../config/db.js";
import bcrypt from "bcrypt";

// ─── GET ALL USERS (ADMIN) ────────────────────────────────────────────────────

export const getAllUsers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, role, created_at
       FROM users
       ORDER BY id DESC`
        );

        return res.status(200).json({ users: result.rows });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── GET SINGLE USER (ADMIN) ──────────────────────────────────────────────────

export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const result = await pool.query(
            "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({ user: result.rows[0] });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── CREATE STAFF (ADMIN) ─────────────────────────────────────────────────────

export const createStaff = async (req, res) => {
    try {
        let { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email, and password are required" });
        }

        name = name.trim();
        email = email.trim().toLowerCase();

        if (!name) return res.status(400).json({ message: "Name is required" });

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email address" });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }
        if (!/[A-Z]/.test(password)) {
            return res.status(400).json({ message: "Password must contain an uppercase letter" });
        }
        if (!/[a-z]/.test(password)) {
            return res.status(400).json({ message: "Password must contain a lowercase letter" });
        }
        if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;'\/]/.test(password)) {
            return res.status(400).json({ message: "Password must contain a special character" });
        }

        const password_hash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'STAFF')
       RETURNING id, name, email, role, created_at`,
            [name, email, password_hash]
        );

        return res.status(201).json({
            message: "Staff account created successfully",
            user: result.rows[0],
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({ message: "An account with this email already exists" });
        }
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── UPDATE USER (ADMIN) ──────────────────────────────────────────────────────

export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        let { name, email } = req.body;

        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        if (!name || !email) {
            return res.status(400).json({ message: "Name and email are required" });
        }

        name = name.trim();
        email = email.trim().toLowerCase();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: "Invalid email address" });
        }

        const result = await pool.query(
            `UPDATE users
       SET name = $1, email = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, email, role, created_at`,
            [name, email, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({
            message: "User updated successfully",
            user: result.rows[0],
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({ message: "An account with this email already exists" });
        }
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── DELETE USER (ADMIN) ──────────────────────────────────────────────────────

export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        // Prevent admin from deleting their own account
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ message: "You cannot delete your own account" });
        }

        const result = await pool.query(
            "DELETE FROM users WHERE id = $1 RETURNING id",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
