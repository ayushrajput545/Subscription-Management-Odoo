
import pool from "./config/db.js";

const check = async () => {
    try {
        const r1 = await pool.query("SELECT * FROM migrations");
        console.log("Migrations table rows:", JSON.stringify(r1.rows));
        const r2 = await pool.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        );
        console.log("Public tables:", r2.rows.map((r) => r.table_name).join(", "));
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        await pool.end();
    }
};

check();
