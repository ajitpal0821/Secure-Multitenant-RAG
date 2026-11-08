
import { Request } from "express";

export interface AuthUser {
    id: string;
    tenantId: string;
    email: string;
    role: "admin" | "manager" | "employee";
}

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}
