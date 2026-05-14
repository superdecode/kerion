-- Migration 033: Widen audit_log.entity_id from INTEGER to TEXT
-- Tarimas (and all tables after migration 020) use UUID primary keys.
-- The original INTEGER column cannot hold UUID values, causing tarima log queries to fail.
-- Changing to TEXT keeps backward compatibility with any historical integer IDs.
-- Wrapped in a DO block so it is safe to re-run if the column is already TEXT or the table doesn't exist yet.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log'
      AND column_name = 'entity_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE audit_log ALTER COLUMN entity_id TYPE TEXT USING entity_id::text;
    DROP INDEX IF EXISTS idx_audit_log_entity;
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
  END IF;
END $$;
