import express from "express";
import cors from "cors";

import { pool } from "./db/pool.js";
import { getSecurityFlags } from "./config/security.js";
import { errorHandler } from "./middleware/error.middleware.js";

import authRoutes from "./routes/auth.routes.js";
import documentRoutes from "./routes/documents.routes.js";
import chatRoutes from "./routes/chat.routes.js";

const app = express();

// Local development CORS configuration.
app.use(cors());

// Dynamic JSON payload limit based on security flags.
app.use((req, res, next) => {
    const flags = getSecurityFlags();
    const limit = flags.uploadValidation ? "100kb" : "1gb";
    express.json({ limit })(req, res, next);
});

// =====================================
// HEALTH CHECK
// =====================================

app.get("/api/health", async (_req, res) => {
    try {
        await pool.query("SELECT 1");
        const flags = getSecurityFlags();

        res.json({
            status: "ok",
            database: "connected",
            securityMode: flags.mode,
            controls: {
                tenantIsolation: flags.tenantIsolation,
                rbac: flags.rbac,
                uploadValidation: flags.uploadValidation,
                rateLimiting: flags.rateLimiting,
                promptDefense: flags.promptDefense,
                auditLogging: flags.auditLogging
            }
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
// CENTRALIZED ERROR HANDLER
// =====================================

app.use(errorHandler);

export default app;
