import { pool } from "../db/pool.js";
import { getSecurityFlags } from "../config/security.js";

export interface AuditEventInput {
    tenantId?: string;
    userId?: string;
    action: string;
    details?: Record<string, unknown>;
}

export async function logAuditEvent(
    event: AuditEventInput
): Promise<void> {
    const flags = getSecurityFlags();

    if (!flags.auditLogging) {
        return;
    }

    if (!event.tenantId || !event.userId) {
        return;
    }

    try {
        await pool.query(
            `INSERT INTO audit_logs (tenant_id, user_id, action, details)
             VALUES ($1, $2, $3, $4::jsonb)`,
            [
                event.tenantId,
                event.userId,
                event.action,
                JSON.stringify(event.details || {})
            ]
        );
    } catch (error) {
        console.error("Failed to write audit log:", error);
    }
}

