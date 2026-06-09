-- Add free-text location note to pick_sessions (replaces FK-based ubicacion_id for surtido)
ALTER TABLE pick_sessions ADD COLUMN IF NOT EXISTS ubicacion_nota TEXT;
