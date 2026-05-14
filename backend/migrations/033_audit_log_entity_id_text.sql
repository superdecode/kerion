-- Migration 033: Widen audit_log.entity_id from INTEGER to TEXT
-- Tarimas (and all tables after migration 020) use UUID primary keys.
-- The original INTEGER column cannot hold UUID values, causing tarima log queries to fail.
-- Changing to TEXT keeps backward compatibility with any historical integer IDs.

ALTER TABLE audit_log ALTER COLUMN entity_id TYPE TEXT USING entity_id::text;

-- Drop old index (type changed) and recreate.
DROP INDEX IF EXISTS idx_audit_log_entity;
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
