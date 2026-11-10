import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/auth.types.js";
import { getSecurityFlags } from "../config/security.js";
import {
    incrementRateLimitKey,
    resetRateLimitKey
} from "../services/redis.service.js";
import { logAuditEvent } from "../services/audit.service.js";

export interface RateLimitOptions {
    scope: string;
    maxRequests: number;
    windowSeconds: number;
}

export function getRateLimitKey(
    scope: string,
    identifier: string
): string {
    return `rag:ratelimit:${scope}:${identifier}`;
}

export async function resetUserScopeRateLimit(
    scope: string,
    userId: string
): Promise<void> {
    await resetRateLimitKey(getRateLimitKey(scope, userId));
}

export function createRateLimiter(options: RateLimitOptions) {
    return async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ) => {
        const flags = getSecurityFlags();

        if (!flags.rateLimiting) {
            return next();
        }

        const identifier =
            req.user?.id ||
            req.ip ||
            req.socket.remoteAddress ||
            "anonymous";

        const key = getRateLimitKey(options.scope, identifier);

        try {
            const count = await incrementRateLimitKey(
                key,
                options.windowSeconds
            );

            res.setHeader(
                "X-RateLimit-Limit",
                String(options.maxRequests)
            );
            res.setHeader(
                "X-RateLimit-Remaining",
                String(Math.max(0, options.maxRequests - count))
            );

            if (count > options.maxRequests) {
                res.setHeader(
                    "Retry-After",
                    String(options.windowSeconds)
                );

                await logAuditEvent({
                    tenantId: req.user?.tenantId,
                    userId: req.user?.id,
                    action: "RATE_LIMIT_EXCEEDED",
                    details: {
                        scope: options.scope,
                        count,
                        maxRequests: options.maxRequests,
                        windowSeconds: options.windowSeconds,
                        path: req.originalUrl
                    }
                });

                return res.status(429).json({
                    message: "Too many requests. Please try again later."
                });
            }

            return next();
        } catch (error) {
            console.error("Rate limiter error:", error);
            return next();
        }
    };
}

