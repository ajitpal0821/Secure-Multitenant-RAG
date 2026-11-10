import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { getSecurityFlags } from "../config/security.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resetUserScopeRateLimit } from "../middleware/rate-limit.middleware.js";
import { logAuditEvent } from "../services/audit.service.js";
import { AuthenticatedRequest } from "../types/auth.types.js";

const router = Router();

// =====================================
// REGISTER
// =====================================

router.post(
    "/register",
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const flags = getSecurityFlags();
            const { email, password, tenantId, role } = req.body;

            if (!email || !password || !tenantId) {
                return res.status(400).json({
                    message: "All fields are required"
                });
            }

            // In hardened RBAC mode, self-registered accounts are forced to 'employee'.
            const assignedRole = flags.rbac
                ? "employee"
                : role || "employee";

            const passwordHash = await bcrypt.hash(password, 10);

            const result = await pool.query(
                `INSERT INTO users
         (tenant_id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, email, role`,
                [tenantId, email, passwordHash, assignedRole]
            );

            const createdUser = result.rows[0];

            await logAuditEvent({
                tenantId: createdUser.tenant_id,
                userId: createdUser.id,
                action: "USER_REGISTERED",
                details: {
                    email: createdUser.email,
                    role: createdUser.role,
                    requestedRole: role
                }
            });

            return res.status(201).json({
                message: "Registration successful",
                user: createdUser
            });
        } catch (error) {
            return next(error);
        }
    }
);

// =====================================
// LOGIN
// =====================================

router.post(
    "/login",
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    message: "Email and password are required"
                });
            }

            const result = await pool.query(
                `SELECT id, tenant_id, email, password_hash, role
         FROM users
         WHERE email = $1`,
                [email]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    message: "Invalid credentials"
                });
            }

            const user = result.rows[0];

            const passwordMatches = await bcrypt.compare(
                password,
                user.password_hash
            );

            if (!passwordMatches) {
                await logAuditEvent({
                    tenantId: user.tenant_id,
                    userId: user.id,
                    action: "AUTH_LOGIN_FAILED",
                    details: { email: user.email }
                });

                return res.status(401).json({
                    message: "Invalid credentials"
                });
            }

            const payload = {
                id: user.id,
                tenantId: user.tenant_id,
                email: user.email,
                role: user.role
            };

            const token = jwt.sign(
                payload,
                env.jwtSecret,
                { expiresIn: "7d" }
            );

            await resetUserScopeRateLimit("documents:list", user.id);

            await logAuditEvent({
                tenantId: user.tenant_id,
                userId: user.id,
                action: "AUTH_LOGIN_SUCCESS",
                details: { email: user.email, role: user.role }
            });

            return res.json({
                message: "Login successful",
                token,
                user: payload
            });
        } catch (error) {
            return next(error);
        }
    }
);

// =====================================
// CURRENT USER
// =====================================

router.get(
    "/me",
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
        return res.json({
            user: req.user
        });
    }
);

export default router;
