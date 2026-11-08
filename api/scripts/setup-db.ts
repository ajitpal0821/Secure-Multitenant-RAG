
import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "../src/db/pool";

async function setupDatabase() {
    try {
        const schemaPath = path.resolve(
            process.cwd(),
            "db/schema.sql"
        );

        const schema = await fs.readFile(schemaPath, "utf8");

        await pool.query(schema);

        console.log("Database schema created successfully.");
    } catch (error) {
        console.error("Database setup failed:", error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

setupDatabase();
