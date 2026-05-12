-- Migration 005: Add timezone preference per user
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS zona_horaria VARCHAR(50) DEFAULT 'America/Mexico_City';
