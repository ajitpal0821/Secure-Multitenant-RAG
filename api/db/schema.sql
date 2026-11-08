
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================
-- TENANTS
-- =====================================

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL
);

-- =====================================
-- USERS
-- =====================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id UUID NOT NULL
        REFERENCES tenants(id) ON DELETE CASCADE,

    email VARCHAR(255) UNIQUE NOT NULL,

    password_hash TEXT NOT NULL,

    role VARCHAR(20) NOT NULL
        CHECK (role IN ('admin', 'manager', 'employee')),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================
-- DOCUMENTS
-- =====================================

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id UUID NOT NULL
        REFERENCES tenants(id) ON DELETE CASCADE,

    uploaded_by UUID NOT NULL
        REFERENCES users(id),

    title VARCHAR(500) NOT NULL,

    min_role VARCHAR(20) NOT NULL DEFAULT 'employee'
        CHECK (min_role IN ('admin', 'manager', 'employee')),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================
-- CHUNKS
-- =====================================

CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    document_id UUID NOT NULL
        REFERENCES documents(id) ON DELETE CASCADE,

    tenant_id UUID NOT NULL
        REFERENCES tenants(id) ON DELETE CASCADE,

    min_role VARCHAR(20) NOT NULL DEFAULT 'employee',

    content TEXT NOT NULL,

    embedding vector(768),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================
-- AUDIT LOGS
-- =====================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id UUID NOT NULL
        REFERENCES tenants(id),

    user_id UUID NOT NULL
        REFERENCES users(id),

    action VARCHAR(255) NOT NULL,

    details JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================
-- INDEXES
-- =====================================

CREATE INDEX IF NOT EXISTS idx_users_tenant
ON users(tenant_id);

CREATE INDEX IF NOT EXISTS idx_documents_tenant
ON documents(tenant_id);

CREATE INDEX IF NOT EXISTS idx_chunks_document
ON chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_chunks_tenant
ON chunks(tenant_id);

CREATE INDEX IF NOT EXISTS idx_audit_tenant
ON audit_logs(tenant_id);
