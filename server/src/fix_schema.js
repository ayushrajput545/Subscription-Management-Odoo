
/**
 * One-time fix: drops old users table (wrong schema) and re-runs migration 001.
 * Run this ONCE if you had the old project before Phase 1.
 */
import pool from "./config/db.js";

const fix = async () => {
    const client = await pool.connect();
    try {
        console.log("Dropping old users table if it has wrong schema...");
        await client.query("DROP TABLE IF EXISTS users CASCADE");
        await client.query("DELETE FROM migrations WHERE filename = '001_create_users.sql'");
        console.log("Old table dropped and migration record cleared.");
        console.log("Run: npm run migrate");
    } catch (e) {
        console.error("Fix failed:", e.message);
    } finally {
        client.release();
        await pool.end();
    }
};

fix();
