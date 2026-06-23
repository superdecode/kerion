-- Add 'torton' to the allowed vehicle types in dispatch_unidades
ALTER TABLE dispatch_unidades
  DROP CONSTRAINT IF EXISTS dispatch_unidades_tipo_check;

ALTER TABLE dispatch_unidades
  ADD CONSTRAINT dispatch_unidades_tipo_check
    CHECK (tipo IN ('camion','furgon','camioneta','trailer','torton','moto'));
