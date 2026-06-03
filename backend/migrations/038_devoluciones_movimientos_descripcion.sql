BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'dev_movimientos'
      AND column_name = 'motivo'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'dev_movimientos'
      AND column_name = 'descripcion'
  ) THEN
    ALTER TABLE dev_movimientos RENAME COLUMN motivo TO descripcion;
  END IF;
END $$;

COMMIT;
