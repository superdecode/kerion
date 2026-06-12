ALTER TABLE anormalidades_codigos
  ALTER COLUMN nivel_sugerido TYPE VARCHAR(50);

ALTER TABLE anormalidades
  ALTER COLUMN nivel TYPE VARCHAR(50);

ALTER TABLE anormalidades_codigos
  DROP CONSTRAINT IF EXISTS anormalidades_codigos_nivel_sugerido_check;

ALTER TABLE anormalidades
  DROP CONSTRAINT IF EXISTS anormalidades_nivel_check;

DO $$
DECLARE
  cfg RECORD;
BEGIN
  FOR cfg IN
    SELECT tenant_id, horas_limite_l1, horas_limite_l2, horas_limite_l3
    FROM anormalidades_config
  LOOP
    INSERT INTO configuraciones (tenant_id, modulo, tipo, codigo, nombre, descripcion, activo, config_json)
    VALUES
      (cfg.tenant_id, 'anormalidades', 'nivel', 'L1', 'L1', 'Nivel operativo base', true, jsonb_build_object('prioridad', 1, 'horas_limite', COALESCE(cfg.horas_limite_l1, 48))),
      (cfg.tenant_id, 'anormalidades', 'nivel', 'L2', 'L2', 'Nivel de atención intermedia', true, jsonb_build_object('prioridad', 2, 'horas_limite', COALESCE(cfg.horas_limite_l2, 24))),
      (cfg.tenant_id, 'anormalidades', 'nivel', 'L3', 'L3', 'Nivel crítico', true, jsonb_build_object('prioridad', 3, 'horas_limite', COALESCE(cfg.horas_limite_l3, 4)))
    ON CONFLICT (tenant_id, modulo, tipo, codigo) DO NOTHING;
  END LOOP;
END $$;
