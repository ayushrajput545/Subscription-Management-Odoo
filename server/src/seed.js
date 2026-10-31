
/**
 * One-time admin bootstrap script.
 * Run: node src/seed.js
 *
 * Reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from .env
 * Creates the initial admin account if one does not already exist.
 * Safe to run multiple times — will not create duplicates.
 * Never logs passwords.
 */

import bcrypt from "bcrypt";
import pool from "./config/db.js";
import dotenv from "dotenv";

dotenv.config();

const seedAdmin = async () => {
    try {
        const name = process.env.ADMIN_NAME?.trim();
        const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const password = process.env.ADMIN_PASSWORD;

        if (!name || !email || !password) {
            console.error(
                "Missing ADMIN_NAME, ADMIN_EMAIL, or ADMIN_PASSWORD in .env"
            );
            process.exit(1);
        }

        // Check if admin already exists
        const existing = await pool.query(
            "SELECT id FROM users WHERE LOWER(email) = $1",
            [email]
        );

        if (existing.rows.length > 0) {
            console.log(`Admin account already exists for: ${email}`);
            return;
        }

        const password_hash = await bcrypt.hash(password, 12);

        await pool.query(
            `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'ADMIN')`,
            [name, email, password_hash]
        );

        console.log(`Admin account created for: ${email}`);
    } catch (error) {
        console.error("Seed failed:", error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
};

seedAdmin();
