

import express from "express";
import cors from "cors";

import { pool } from "./db/pool.js";

import authRoutes from "./routes/auth.routes.js";
import documentRoutes from "./routes/documents.routes.js";
import chatRoutes from "./routes/chat.routes.js";

const app = express();

// Local development CORS configuration.
app.use(cors());

// INTENTIONALLY INSECURE:
// Large JSON payloads are accepted for cost-abuse testing.
// This app must remain local-only.
app.use(express.json({ limit: "1gb" }));

// =====================================
// HEALTH CHECK
// =====================================

app.get("/api/health", async (_req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            status: "ok",
            database: "connected",
            securityMode: process.env.SECURITY_MODE || "vulnerable"
        });
    } catch {
        res.status(503).json({
            status: "error",
            database: "disconnected"
        });
    }
});

// =====================================
// ROUTES
// =====================================

app.use("/api/auth", authRoutes);

app.use("/api/documents", documentRoutes);

app.use("/api/chat", chatRoutes);

// =====================================
// NOT FOUND
// =====================================

app.use((_req, res) => {
    res.status(404).json({
        message: "Route not found"
    });
});

// =====================================
// ERROR HANDLER
// =====================================

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);

    res.status(500).json({
        message: "Internal server error"
    });
});

export default app;
