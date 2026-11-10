import { Router, Response, NextFunction } from "express";

import { pool } from "../db/pool.js";
import { getSecurityFlags } from "../config/security.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createRateLimiter } from "../middleware/rate-limit.middleware.js";
import { AuthenticatedRequest } from "../types/auth.types.js";

import {
    embedText,
    generateAnswer
} from "../services/gemini.service.js";
import { getAllowedRoles } from "../services/rbac.service.js";
import {
    isIndirectInjectionAttempt,
    isPromptLeakAttempt,
    sanitizeChunkContent
} from "../services/prompt-defense.service.js";
import { logAuditEvent } from "../services/audit.service.js";

const router = Router();

const chatRateLimiter = createRateLimiter({
    scope: "chat:query",
    maxRequests: 30,
    windowSeconds: 60
});

// =====================================
// RAG CHAT
// =====================================

router.post(
    "/",
    requireAuth,
    chatRateLimiter,
    async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const flags = getSecurityFlags();
            const user = req.user!;
            const { question } = req.body;

            if (!question || typeof question !== "string") {
                return res.status(400).json({
                    message: "Question is required"
                });
            }

            if (flags.uploadValidation && question.length > 2000) {
                return res.status(400).json({
                    message: "Question exceeds maximum allowed length (2000 characters)"
                });
            }

            // Prompt-defense check 1: Direct system-prompt disclosure attempt.
            if (flags.promptDefense && isPromptLeakAttempt(question)) {
                await logAuditEvent({
                    tenantId: user.tenantId,
                    userId: user.id,
                    action: "SYSTEM_PROMPT_LEAK_BLOCKED",
                    details: { question }
                });

                return res.json({
                    question,
                    answer: "Request declined: System instructions are confidential and cannot be disclosed.",
                    sources: [],
                    retrievedChunks: 0
                });
            }

            // Step 1: Generate query embedding.
            const queryEmbedding = await embedText(
                question,
                "RETRIEVAL_QUERY"
            );

            const vector = `[${queryEmbedding.join(",")}]`;

            // Step 2: Retrieve top 5 similar chunks with optional tenant + RBAC isolation.
            const conditions: string[] = [];
            const values: unknown[] = [vector];

            if (flags.tenantIsolation) {
                values.push(user.tenantId);
                conditions.push(`c.tenant_id = $${values.length}`);
            }

            if (flags.rbac) {
                const allowedRoles = getAllowedRoles(user.role);
                values.push(allowedRoles);
                conditions.push(
                    `c.min_role = ANY($${values.length}::text[])`
                );
            }

            const whereClause =
                conditions.length > 0
                    ? `WHERE ${conditions.join(" AND ")}`
                    : "";

            const result = await pool.query(
                `SELECT
           c.id,
           c.content,
           c.tenant_id,
           c.min_role,
           d.title,
           t.name AS tenant_name,
           c.embedding <=> $1::vector AS distance
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         JOIN tenants t ON t.id = c.tenant_id
         ${whereClause}
         ORDER BY c.embedding <=> $1::vector
         LIMIT 5`,
                values
            );

            const sources = result.rows.map((chunk) => ({
                document: chunk.title,
                tenant: chunk.tenant_name,
                distance: Number(chunk.distance)
            }));

            // Prompt-defense check 2: Indirect prompt-injection query detection.
            if (
                flags.promptDefense &&
                isIndirectInjectionAttempt(question)
            ) {
                await logAuditEvent({
                    tenantId: user.tenantId,
                    userId: user.id,
                    action: "PROMPT_INJECTION_BLOCKED",
                    details: {
                        question,
                        retrievedChunks: result.rows.length
                    }
                });

                return res.json({
                    question,
                    answer: "Embedded document instructions were ignored by security policy. Please ask a factual question about the document content.",
                    sources,
                    retrievedChunks: result.rows.length
                });
            }

            // Step 3: Prepare context (with chunk sanitization and XML boundary tags when promptDefense is enabled).
            const context = result.rows
                .map((chunk, index) => {
                    const safeContent = flags.promptDefense
                        ? sanitizeChunkContent(chunk.content)
                        : chunk.content;

                    return `
            <document_content index="${index + 1}" tenant="${chunk.tenant_name}" title="${chunk.title}">
            ${safeContent}
            </document_content>
          `;
                })
                .join("\n\n");

            // Step 4: Generate answer.
            const answer = await generateAnswer(question, context);

            await logAuditEvent({
                tenantId: user.tenantId,
                userId: user.id,
                action: "CHAT_QUERY_COMPLETED",
                details: {
                    questionLength: question.length,
                    retrievedChunks: result.rows.length,
                    tenantIsolation: flags.tenantIsolation,
                    rbac: flags.rbac,
                    promptDefense: flags.promptDefense
                }
            });

            // Step 5: Return response.
            return res.json({
                question,
                answer,
                sources,
                retrievedChunks: result.rows.length
            });
        } catch (error) {
            return next(error);
        }
    }
);

export default router;
