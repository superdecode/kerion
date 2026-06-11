-- Backfill assigned_at for rows that already have a surtidor assigned but no assigned_at.
-- Uses updated_at as best-effort approximation of when the assignment occurred.
UPDATE pick_order_tracking
SET assigned_at = COALESCE(updated_at, created_at)
WHERE surtidor_id IS NOT NULL
  AND assigned_at IS NULL;
