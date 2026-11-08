
-- Enable vector similarity search support.
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify the extension is available.
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vector';
