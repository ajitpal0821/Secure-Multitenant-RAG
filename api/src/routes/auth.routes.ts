
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.middleware";
import { AuthenticatedRequest } from "../types/auth.types";

const router = Router();

// =====================================
// REGISTER
// =====================================

router.post(
    "/register",
    async (req: Request, res: Response) => {
        try {
            const { email, password, tenantId, role } = req.body;

            if (!email || !password || !tenantId || !role) {
                return res.status(400).json({
                    message: "All fields are required"
                });
            }

            // INTENTIONALLY INSECURE:
            // The client controls tenantId and role.
            const passwordHash = await bcrypt.hash(password, 10);

            const result = await pool.query(
                `INSERT INTO users
         (tenant_id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, email, role`,
                [tenantId, email, passwordHash, role]
            );

            return res.status(201).json({
                message: "Registration successful",
                user: result.rows[0]
            });
        } catch (error) {
            console.error("Registration error:", error);

            return res.status(500).json({
                message: "Registration failed"
            });
        }
    }
);

// =====================================
// LOGIN
// =====================================

router.post(
    "/login",
    async (req: Request, res: Response) => {
        try {
            const { email, password } = req.body;

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

            return res.json({
                message: "Login successful",
                token,
                user: payload
            });
        } catch (error) {
            console.error("Login error:", error);

            return res.status(500).json({
                message: "Login failed"
            });
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
