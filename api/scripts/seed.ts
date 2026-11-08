
import bcrypt from "bcryptjs";
import { pool } from "../src/db/pool.js";

const DEMO_PASSWORD = "Password123!";

const demoTenants = [
    {
        name: "Company A",
        users: [
            { email: "admin.a@company-a.local", role: "admin" },
            { email: "manager.a@company-a.local", role: "manager" },
            { email: "employee.a@company-a.local", role: "employee" }
        ]
    },
    {
        name: "Company B",
        users: [
            { email: "admin.b@company-b.local", role: "admin" },
            { email: "manager.b@company-b.local", role: "manager" },
            { email: "employee.b@company-b.local", role: "employee" }
        ]
    }
];

async function seedDatabase() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

        for (const tenantData of demoTenants) {
            const tenantResult = await client.query(
                `INSERT INTO tenants (name)
         VALUES ($1)
         ON CONFLICT (name)
         DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
                [tenantData.name]
            );

            const tenantId = tenantResult.rows[0].id;

            for (const user of tenantData.users) {
                await client.query(
                    `INSERT INTO users
           (tenant_id, email, password_hash, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email)
           DO UPDATE SET
             tenant_id = EXCLUDED.tenant_id,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role`,
                    [
                        tenantId,
                        user.email,
                        passwordHash,
                        user.role
                    ]
                );
            }
        }

        await client.query("COMMIT");

        console.log("Demo tenants and users seeded successfully.");
        console.log("Demo password:", DEMO_PASSWORD);
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Seeding failed:", error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

seedDatabase();
