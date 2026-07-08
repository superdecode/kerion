-- 'with_discrepancies' is the only status meant for an operator explicitly forcing a close with
-- missing boxes (see finalizeMut in Validacion.jsx). A session stored as 'complete' without
-- reaching total_expected was never legitimately finalized — it's a stale artifact of the old
-- force-takeover bug (fixed in migration 092). Reopen these so they read as "En Proceso" and stay
-- editable, instead of the misleading "Con diferencias" / "Completo".
UPDATE pick_sessions
SET status = 'open',
    completed_at = NULL,
    updated_at = now()
WHERE status = 'complete'
  AND total_expected > 0
  AND total_scanned < total_expected;
