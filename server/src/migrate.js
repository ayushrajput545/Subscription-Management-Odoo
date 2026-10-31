
import fs from "fs";
import path from "path";
import pool from "./config/db.js";

const migrate = async () => {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationPath = path.join(
      process.cwd(),
      "src",
      "migrations"
    );

    const files = fs.readdirSync(migrationPath)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      await client.query("BEGIN");

      try {
        const { rows } = await client.query(
          "SELECT id FROM migrations WHERE filename = $1",
          [file]
        );

        if (rows.length > 0) {
          await client.query("ROLLBACK");
          console.log(`Skipped: ${file}`);
          continue;
        }

        const sql = fs.readFileSync(
          path.join(migrationPath, file),
          "utf8"
        );

        await client.query(sql);

        await client.query(
          "INSERT INTO migrations (filename) VALUES ($1)",
          [file]
        );

        await client.query("COMMIT");

        console.log(`Migrated: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("All migrations completed");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();
