
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import pool from "../config/db.js";
import { sendEmail } from "../utils/sendEmail.js";
import dotenv from "dotenv";

dotenv.config();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isStrongPassword = (password) => {
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
    if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;'\/]/.test(password))
        return "Password must contain a special character";
    return null;
};

const setTokenCookie = (res, token) => {
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        maxAge: 60 * 60 * 1000, // 1 hour
    });
};

// ─── Register ─────────────────────────────────────────────────────────────────

export const register = async (req, res) => {
    try {
        let { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        name = name.trim();
        email = email.trim().toLowerCase();

        if (!name) return res.status(400).json({ message: "Name is required" });
        if (!isValidEmail(email)) return res.status(400).json({ message: "Invalid email address" });

        const pwError = isStrongPassword(password);
        if (pwError) return res.status(400).json({ message: pwError });

        const password_hash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'CUSTOMER')
       RETURNING id, name, email, role, created_at`,
            [name, email, password_hash]
        );

        return res.status(201).json({
            message: "Registration successful",
            user: result.rows[0],
        });
    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({ message: "An account with this email already exists" });
        }
        console.error("Register error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── Login ────────────────────────────────────────────────────────────────────

export const login = async (req, res) => {
    try {
        let { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        email = email.trim().toLowerCase();

        const result = await pool.query(
            "SELECT id, name, email, password_hash, role FROM users WHERE LOWER(email) = $1",
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "1h" }
        );

        setTokenCookie(res, token);

        return res.status(200).json({
            message: "Login successful",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logout = (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    });
    return res.status(200).json({ message: "Logged out successfully" });
};

// ─── Get Me ───────────────────────────────────────────────────────────────────

export const getMe = async (req, res) => {
    // req.user is set by authMiddleware
    return res.status(200).json({ user: req.user });
};

// ─── Forgot Password ──────────────────────────────────────────────────────────

export const forgotPassword = async (req, res) => {
    try {
        let { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        email = email.trim().toLowerCase();

        // Always return generic response — do not reveal if email exists
        const result = await pool.query(
            "SELECT id FROM users WHERE LOWER(email) = $1",
            [email]
        );

        if (result.rows.length > 0) {
            const userId = result.rows[0].id;

            // Generate secure random token
            const rawToken = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

            // Delete any existing tokens for this user
            await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);

            await pool.query(
                `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
                [userId, tokenHash, expiresAt]
            );

            const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

            await sendEmail({
                to: email,
                subject: "Password Reset Request",
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>You requested a password reset. Click the link below to reset your password:</p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
              Reset Password
            </a>
            <p>This link expires in <strong>15 minutes</strong>.</p>
            <p>If you did not request this, please ignore this email.</p>
          </div>
        `,
            });
        }

        return res.status(200).json({
            message: "If an account with that email exists, a reset link has been sent.",
        });
    } catch (error) {
        console.error("Forgot password error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─── Reset Password ───────────────────────────────────────────────────────────

export const resetPassword = async (req, res) => {
    const client = await pool.connect();
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: "Token and new password are required" });
        }

        const pwError = isStrongPassword(newPassword);
        if (pwError) return res.status(400).json({ message: pwError });

        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        const result = await client.query(
            `SELECT id, user_id, expires_at
       FROM password_reset_tokens
       WHERE token_hash = $1`,
            [tokenHash]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ message: "Invalid or expired reset token" });
        }

        const resetRecord = result.rows[0];

        if (new Date() > new Date(resetRecord.expires_at)) {
            return res.status(400).json({ message: "Reset token has expired" });
        }

        const password_hash = await bcrypt.hash(newPassword, 12);

        await client.query("BEGIN");

        await client.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [password_hash, resetRecord.user_id]
        );

        // Delete ALL reset tokens for this user to prevent reuse
        await client.query(
            "DELETE FROM password_reset_tokens WHERE user_id = $1",
            [resetRecord.user_id]
        );

        await client.query("COMMIT");

        return res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Reset password error:", error);
        return res.status(500).json({ message: "Internal server error" });
    } finally {
        client.release();
    }
};
