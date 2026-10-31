
/**
 * One-time admin bootstrap script.
 * Run: node src/seed.js
 * Update password: node src/seed.js --update-password (or npm run seed -- --update-password)
 *
 * Reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD from .env
 * Creates the initial admin account if one does not already exist.
 * Safe to run multiple times — will not create duplicates.
 * Pass --update-password (or --update-pw) to overwrite the existing admin's password.
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

        const shouldUpdatePassword =
            process.argv.includes("--update-password") ||
            process.argv.includes("--update-pw") ||
            process.env.ADMIN_UPDATE_PASSWORD === "true";

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
            if (shouldUpdatePassword) {
                const password_hash = await bcrypt.hash(password, 12);
                await pool.query(
                    `UPDATE users 
                     SET password_hash = $1, name = $2, role = 'ADMIN', updated_at = NOW() 
                     WHERE LOWER(email) = $3`,
                    [password_hash, name, email]
                );
                console.log(`Admin password updated for: ${email}`);
                return;
            }

            console.log(
                `Admin account already exists for: ${email}. Use --update-password to overwrite password.`
            );
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
