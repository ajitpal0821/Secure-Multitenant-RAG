import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { getSecurityFlags } from "../config/security.js";

export class HttpError extends Error {
    statusCode: number;

    constructor(statusCode: number, message: string) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
    }
}

export function errorHandler(
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    const flags = getSecurityFlags();

    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                message: "Uploaded file exceeds maximum allowed size (5 MB)"
            });
        }

        return res.status(400).json({
            message: `Upload error: ${error.message}`
        });
    }

    if (error instanceof HttpError) {
        return res.status(error.statusCode).json({
            message: error.message
        });
    }

    if (
        error instanceof SyntaxError &&
        "status" in error &&
        (error as { status?: number }).status === 400
    ) {
        return res.status(400).json({
            message: "Invalid JSON payload"
        });
    }

    if (
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        (error as { type?: string }).type === "entity.too.large"
    ) {
        return res.status(413).json({
            message: "Request payload too large"
        });
    }

    console.error("Unhandled error:", error);

    if (flags.mode === "vulnerable" && error instanceof Error) {
        return res.status(500).json({
            message: "Internal server error",
            error: error.message
        });
    }

    return res.status(500).json({
        message: "Internal server error"
    });
}

