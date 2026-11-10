export type Role = "admin" | "manager" | "employee";

const VALID_ROLES: Role[] = ["admin", "manager", "employee"];

const ROLE_HIERARCHY: Record<Role, number> = {
    employee: 1,
    manager: 2,
    admin: 3
};

export function isValidRole(role: unknown): role is Role {
    return (
        typeof role === "string" &&
        VALID_ROLES.includes(role as Role)
    );
}

/**
 * Returns the document `min_role` levels that a user with `userRole` is permitted to read.
 */
export function getAllowedRoles(userRole: string): Role[] {
    switch (userRole) {
        case "admin":
            return ["admin", "manager", "employee"];
        case "manager":
            return ["manager", "employee"];
        case "employee":
        default:
            return ["employee"];
    }
}

/**
 * Checks whether a user with `userRole` is permitted to classify an uploaded document as `targetMinRole`.
 */
export function canAssignMinRole(
    userRole: string,
    targetMinRole: string
): boolean {
    if (!isValidRole(userRole) || !isValidRole(targetMinRole)) {
        return false;
    }

    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[targetMinRole];
}

