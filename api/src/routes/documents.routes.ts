
import { Router, Response } from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse";

import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.middleware";
import { AuthenticatedRequest } from "../types/auth.types";

import { splitIntoChunks } from "../services/chunk.service.js";
import { embedText } from "../services/gemini.service.js";

const router = Router();

// INTENTIONALLY INSECURE:
// Memory storage with no application-level file size limit.
const upload = multer({
    storage: multer.memoryStorage()
});

// =====================================
// UPLOAD DOCUMENT
// =====================================

router.post(
    "/upload",
    requireAuth,
    upload.single("file"),
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const file = req.file;
            const user = req.user!;

            if (!file) {
                return res.status(400).json({
                    message: "Please upload a file"
                });
            }

            const extension = file.originalname
                .split(".")
                .pop()
                ?.toLowerCase();

            let extractedText = "";

            if (extension === "pdf" || file.mimetype === "application/pdf") {
                const parser = new PDFParse({ data: file.buffer });
                const result = await parser.getText();
                extractedText = result.text;
                await parser.destroy();
            } else if (extension === "txt" || file.mimetype === "text/plain") {
                extractedText = file.buffer.toString("utf8");
            } else {
                return res.status(400).json({
                    message: "Only TXT and PDF files are supported"
                });
            }

            const title =
                req.body.title || file.originalname;

            const minRole =
                req.body.minRole || "employee";

            const chunks = splitIntoChunks(extractedText);

            if (chunks.length === 0) {
                return res.status(400).json({
                    message: "Document contains no extractable text"
                });
            }

            // Save document.
            const documentResult = await pool.query(
                `INSERT INTO documents
         (tenant_id, uploaded_by, title, min_role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, tenant_id`,
                [
                    user.tenantId,
                    user.id,
                    title,
                    minRole
                ]
            );

            const document = documentResult.rows[0];

            // Generate embeddings and store chunks.
            for (const chunk of chunks) {
                const embedding = await embedText(
                    chunk,
                    "RETRIEVAL_DOCUMENT"
                );

                const vector = `[${embedding.join(",")}]`;

                await pool.query(
                    `INSERT INTO chunks
           (document_id, tenant_id, min_role, content, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
                    [
                        document.id,
                        user.tenantId,
                        minRole,
                        chunk,
                        vector
                    ]
                );
            }

            return res.status(201).json({
                message: "Document uploaded successfully",
                documentId: document.id,
                title: document.title,
                chunksCreated: chunks.length
            });
        } catch (error) {
            console.error("Document upload error:", error);

            return res.status(500).json({
                message: "Document processing failed"
            });
        }
    }
);

// =====================================
// LIST DOCUMENTS
// =====================================

router.get(
    "/",
    requireAuth,
    async (_req: AuthenticatedRequest, res: Response) => {
        try {
            // INTENTIONALLY INSECURE:
            // No tenant filter or role filter.
            const result = await pool.query(
                `SELECT
           d.id,
           d.title,
           d.tenant_id,
           d.min_role,
           d.created_at,
           t.name AS tenant_name
         FROM documents d
         JOIN tenants t ON t.id = d.tenant_id
         ORDER BY d.created_at DESC`
            );

            return res.json({
                documents: result.rows
            });
        } catch (error) {
            console.error("Document listing error:", error);

            return res.status(500).json({
                message: "Unable to retrieve documents"
            });
        }
    }
);

export default router;
