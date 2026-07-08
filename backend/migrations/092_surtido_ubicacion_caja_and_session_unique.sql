-- Per-caja location note: lets an operator override the order-level ubicacion for a single box
-- without affecting the rest of the session's boxes.
ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS ubicacion_nota TEXT;

-- Merge pre-existing duplicate OPEN sessions for the same order into a single canonical session
-- before the uniqueness invariant below is enforced. Idempotent: a no-op once every order has
-- at most one open session.
DO $$
DECLARE
  dup RECORD;
  keep_id UUID;
  other_ids UUID[];
BEGIN
  FOR dup IN
    SELECT tenant_id, outbound_order_no
    FROM pick_sessions
    WHERE status = 'open'
    GROUP BY tenant_id, outbound_order_no
    HAVING COUNT(*) > 1
  LOOP
    -- Canonical session: the one with the most scans recorded, earliest start as tiebreaker.
    SELECT s.id INTO keep_id
    FROM pick_sessions s
    LEFT JOIN (
      SELECT session_id, COUNT(*) AS cnt FROM pick_events GROUP BY session_id
    ) ev ON ev.session_id = s.id
    WHERE s.tenant_id = dup.tenant_id
      AND s.outbound_order_no = dup.outbound_order_no
      AND s.status = 'open'
    ORDER BY COALESCE(ev.cnt, 0) DESC, s.started_at ASC
    LIMIT 1;

    SELECT array_agg(id) INTO other_ids
    FROM pick_sessions
    WHERE tenant_id = dup.tenant_id
      AND outbound_order_no = dup.outbound_order_no
      AND status = 'open'
      AND id <> keep_id;

    -- Fold every box scan from the duplicate sessions into the canonical one.
    UPDATE pick_events SET session_id = keep_id WHERE session_id = ANY(other_ids);

    -- A box scanned 'ok' in more than one of the merged sessions is now duplicated under the
    -- same session — keep only the earliest 'ok' scan per box, demote the rest to 'duplicate'
    -- (same convention the app already uses for repeat scans within one session).
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY REGEXP_REPLACE(
                 UPPER(COALESCE(NULLIF(matched_box_type, ''), NULLIF(normalized_code, ''), NULLIF(scanned_code, ''))),
                 '[^A-Z0-9]', '', 'g'
               )
               ORDER BY scanned_at ASC
             ) AS rn
      FROM pick_events
      WHERE session_id = keep_id AND scan_result = 'ok'
    )
    UPDATE pick_events e
    SET scan_result = 'duplicate', edited_at = now()
    FROM ranked r
    WHERE e.id = r.id AND r.rn > 1;

    -- Carry over the widest expected count and a location note if the canonical session lacks one.
    UPDATE pick_sessions
    SET total_expected = GREATEST(
          total_expected,
          (SELECT MAX(total_expected) FROM pick_sessions WHERE id = ANY(other_ids))
        ),
        ubicacion_nota = COALESCE(
          ubicacion_nota,
          (SELECT ubicacion_nota FROM pick_sessions WHERE id = ANY(other_ids) AND ubicacion_nota IS NOT NULL LIMIT 1)
        ),
        updated_at = now()
    WHERE id = keep_id;

    DELETE FROM pick_sessions WHERE id = ANY(other_ids);
  END LOOP;
END $$;

-- Recompute total_scanned for every open session with the same dedup rule the app uses,
-- since events may have just been reassigned/demoted above.
UPDATE pick_sessions s
SET total_scanned = COALESCE(stats.total_scanned, 0), updated_at = now()
FROM (
  SELECT session_id,
         COUNT(DISTINCT REGEXP_REPLACE(
           UPPER(COALESCE(NULLIF(matched_box_type, ''), NULLIF(normalized_code, ''), NULLIF(scanned_code, ''))),
           '[^A-Z0-9]', '', 'g'
         )) AS total_scanned
  FROM pick_events
  WHERE scan_result = 'ok'
  GROUP BY session_id
) stats
WHERE s.id = stats.session_id AND s.status = 'open';

-- At most one OPEN validation session per order. Prevents the "2 registros" bug where a
-- takeover/race condition created a second pick_sessions row for the same outbound_order_no.
CREATE UNIQUE INDEX IF NOT EXISTS pick_sessions_open_per_order
  ON pick_sessions (tenant_id, outbound_order_no)
  WHERE status = 'open';
