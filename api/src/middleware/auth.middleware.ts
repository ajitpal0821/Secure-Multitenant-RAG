
import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { AuthenticatedRequest, AuthUser } from "../types/auth.types";

export function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Authentication token required"
        });
    }

    const token = authorization.split(" ")[1];

    try {
        const decoded = jwt.verify(
            token,
            env.jwtSecret
        ) as AuthUser;

        req.user = decoded;

        next();
    } catch {
        return res.status(401).json({
            message: "Invalid or expired token"
        });
    }
}
