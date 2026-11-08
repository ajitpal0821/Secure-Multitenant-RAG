
import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

// Shared PostgreSQL connection pool.
export const pool = new Pool({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.database
});

// Log unexpected database errors.
pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL error:", error);
});
