import { Router, Response, NextFunction } from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse";

import { pool } from "../db/pool.js";
import { getSecurityFlags } from "../config/security.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
    createRateLimiter,
    resetUserScopeRateLimit
} from "../middleware/rate-limit.middleware.js";
import { AuthenticatedRequest } from "../types/auth.types.js";

import { splitIntoChunks } from "../services/chunk.service.js";
import { embedText } from "../services/gemini.service.js";
import {
    canAssignMinRole,
    getAllowedRoles,
    isValidRole
} from "../services/rbac.service.js";
import { logAuditEvent } from "../services/audit.service.js";

const router = Router();

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
    storage: multer.memoryStorage()
});

const uploadRateLimiter = createRateLimiter({
    scope: "documents:upload",
    maxRequests: 10,
    windowSeconds: 60
});

const listRateLimiter = createRateLimiter({
    scope: "documents:list",
    maxRequests: 1,
    windowSeconds: 60
});

// =====================================
// UPLOAD DOCUMENT
// =====================================

router.post(
    "/upload",
    requireAuth,
    uploadRateLimiter,
    upload.single("file"),
    async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const flags = getSecurityFlags();
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

            // Upload validation and file-size limits when enabled.
            if (flags.uploadValidation) {
                if (file.size === 0) {
                    return res.status(400).json({
                        message: "Uploaded file cannot be empty"
                    });
                }

                if (file.size > MAX_UPLOAD_SIZE_BYTES) {
                    return res.status(413).json({
                        message: "Uploaded file exceeds 5 MB limit"
                    });
                }

                const validExtension =
                    extension === "pdf" || extension === "txt";
                const validMime =
                    file.mimetype === "application/pdf" ||
                    file.mimetype === "text/plain";

                if (!validExtension || !validMime) {
                    return res.status(400).json({
                        message: "Only valid TXT and PDF files are permitted"
                    });
                }

                if (extension === "pdf") {
                    const magicHeader = file.buffer
                        .subarray(0, 5)
                        .toString("ascii");
                    if (magicHeader !== "%PDF-") {
                        return res.status(400).json({
                            message: "Invalid PDF file header"
                        });
                    }
                }
            }

            let extractedText = "";

            if (extension === "pdf" || file.mimetype === "application/pdf") {
                const parser = new PDFParse({ data: file.buffer });
                const result = await parser.getText();
                extractedText = result.text;
                await parser.destroy();
            } else if (
                extension === "txt" ||
                file.mimetype === "text/plain"
            ) {
                extractedText = file.buffer.toString("utf8");
            } else {
                return res.status(400).json({
                    message: "Only TXT and PDF files are supported"
                });
            }

            const title = (
                req.body.title || file.originalname
            ).slice(0, 500);

            const minRole = req.body.minRole || "employee";

            if (flags.rbac) {
                if (!isValidRole(minRole)) {
                    return res.status(400).json({
                        message: "Invalid minimum role classification"
                    });
                }

                if (!canAssignMinRole(user.role, minRole)) {
                    await logAuditEvent({
                        tenantId: user.tenantId,
                        userId: user.id,
                        action: "RBAC_UPLOAD_DENIED",
                        details: {
                            userRole: user.role,
                            attemptedMinRole: minRole,
                            title
                        }
                    });

                    return res.status(403).json({
                        message: "Insufficient role permissions to assign this classification"
                    });
                }
            }

            const chunks = splitIntoChunks(extractedText);

            if (chunks.length === 0) {
                return res.status(400).json({
                    message: "Document contains no extractable text"
                });
            }

            const documentResult = await pool.query(
                `INSERT INTO documents
         (tenant_id, uploaded_by, title, min_role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, tenant_id`,
                [user.tenantId, user.id, title, minRole]
            );

            const document = documentResult.rows[0];

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

            await resetUserScopeRateLimit("documents:list", user.id);

            await logAuditEvent({
                tenantId: user.tenantId,
                userId: user.id,
                action: "DOCUMENT_UPLOADED",
                details: {
                    documentId: document.id,
                    title: document.title,
                    minRole,
                    chunksCreated: chunks.length
                }
            });

            return res.status(201).json({
                message: "Document uploaded successfully",
                documentId: document.id,
                title: document.title,
                chunksCreated: chunks.length
            });
        } catch (error) {
            return next(error);
        }
    }
);

// =====================================
// LIST DOCUMENTS
// =====================================

router.get(
    "/",
    requireAuth,
    listRateLimiter,
    async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const flags = getSecurityFlags();
            const user = req.user!;

            const conditions: string[] = [];
            const values: unknown[] = [];

            if (flags.tenantIsolation) {
                values.push(user.tenantId);
                conditions.push(`d.tenant_id = $${values.length}`);
            }

            if (flags.rbac) {
                const allowedRoles = getAllowedRoles(user.role);
                values.push(allowedRoles);
                conditions.push(
                    `d.min_role = ANY($${values.length}::text[])`
                );
            }

            const whereClause =
                conditions.length > 0
                    ? `WHERE ${conditions.join(" AND ")}`
                    : "";

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
         ${whereClause}
         ORDER BY d.created_at DESC`,
                values
            );

            await logAuditEvent({
                tenantId: user.tenantId,
                userId: user.id,
                action: "DOCUMENTS_LISTED",
                details: {
                    returnedCount: result.rows.length,
                    tenantIsolation: flags.tenantIsolation,
                    rbac: flags.rbac
                }
            });

            return res.json({
                documents: result.rows
            });
        } catch (error) {
            return next(error);
        }
    }
);

export default router;
