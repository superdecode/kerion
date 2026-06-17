-- Migration 067: Add tour completion tracking per user
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tour_completado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tour_completado_at TIMESTAMPTZ;
