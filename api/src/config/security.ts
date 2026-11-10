import dotenv from "dotenv";
import path from "node:path";
import { env } from "./env.js";

export interface SecurityFlags {
    mode: "vulnerable" | "hardened";
    tenantIsolation: boolean;
    rbac: boolean;
    uploadValidation: boolean;
    rateLimiting: boolean;
    promptDefense: boolean;
    auditLogging: boolean;
}

function cleanValue(val: string | undefined): string | undefined {
    if (val === undefined) return undefined;
    return val.split("#")[0].trim();
}

function parseFlag(
    envValue: string | undefined,
    defaultWhenHardened: boolean
): boolean {
    const cleaned = cleanValue(envValue);
    if (cleaned !== undefined && cleaned !== "") {
        return cleaned.toLowerCase() === "true";
    }
    return defaultWhenHardened;
}

export function getSecurityFlags(): SecurityFlags {
    dotenv.config({
        path: path.resolve(process.cwd(), "../.env"),
        override: true
    });

    const rawMode =
        cleanValue(process.env.SECURITY_MODE) || env.securityMode;

    const mode =
        rawMode.toLowerCase() === "hardened"
            ? "hardened"
            : "vulnerable";

    const isHardened = mode === "hardened";

    return {
        mode,
        tenantIsolation: parseFlag(
            process.env.ENABLE_TENANT_ISOLATION,
            isHardened
        ),
        rbac: parseFlag(process.env.ENABLE_RBAC, isHardened),
        uploadValidation: parseFlag(
            process.env.ENABLE_UPLOAD_VALIDATION,
            isHardened
        ),
        rateLimiting: parseFlag(
            process.env.ENABLE_RATE_LIMITING,
            isHardened
        ),
        promptDefense: parseFlag(
            process.env.ENABLE_PROMPT_DEFENSE,
            isHardened
        ),
        auditLogging: parseFlag(
            process.env.ENABLE_AUDIT_LOGGING,
            isHardened
        )
    };
}
