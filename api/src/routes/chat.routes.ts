
import { Router, Response } from "express";

import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.middleware";
import { AuthenticatedRequest } from "../types/auth.types";

import {
    embedText,
    generateAnswer
} from "../services/gemini.service.js";

const router = Router();

// =====================================
// RAG CHAT
// =====================================

router.post(
    "/",
    requireAuth,
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { question } = req.body;

            if (!question) {
                return res.status(400).json({
                    message: "Question is required"
                });
            }

            // Step 1: Generate query embedding.
            const queryEmbedding = await embedText(
                question,
                "RETRIEVAL_QUERY"
            );

            const vector = `[${queryEmbedding.join(",")}]`;

            // Step 2: Retrieve top 5 similar chunks.
            //
            // INTENTIONALLY INSECURE:
            // No tenant_id filter.
            // No min_role filter.
            //
            // This allows cross-tenant and cross-role retrieval.

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
         ORDER BY c.embedding <=> $1::vector
         LIMIT 5`,
                [vector]
            );

            // Step 3: Prepare context.
            const context = result.rows
                .map((chunk, index) => {
                    return `
            Source ${index + 1}
            Tenant: ${chunk.tenant_name}
            Document: ${chunk.title}
            Content: ${chunk.content}
          `;
                })
                .join("\n\n");

            // Step 4: Generate answer.
            const answer = await generateAnswer(
                question,
                context
            );

            // Step 5: Return response.
            return res.json({
                question,
                answer,

                sources: result.rows.map((chunk) => ({
                    document: chunk.title,
                    tenant: chunk.tenant_name,
                    distance: Number(chunk.distance)
                })),

                retrievedChunks: result.rows.length
            });
        } catch (error) {
            console.error("Chat error:", error);

            return res.status(500).json({
                message: "Unable to process chat request"
            });
        }
    }
);

export default router;
