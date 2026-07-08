-- Migrations 092/093 only merged duplicate OPEN sessions and reopened stale 'complete' ones
-- separately. Orders that had one OPEN session plus a stale 'complete'/'with_discrepancies'
-- duplicate (or several non-open duplicates) were left unmerged, since 093 could collide with
-- the open_per_order unique index when trying to reopen a duplicate for an order that already
-- had an open row. This migration consolidates ANY set of duplicate sessions for the same order
-- — any status combination — into a single row, and is safe to run standalone or after 092/093.
-- Idempotent: a no-op once every order has exactly one pick_sessions row.
DO $$
DECLARE
  dup RECORD;
  keep_id UUID;
  other_ids UUID[];
  merged_expected INTEGER;
  merged_scanned INTEGER;
  merged_ubicacion TEXT;
  has_discrepancy BOOLEAN;
  final_status TEXT;
BEGIN
  FOR dup IN
    SELECT tenant_id, outbound_order_no
    FROM pick_sessions
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
    ORDER BY COALESCE(ev.cnt, 0) DESC, s.started_at ASC
    LIMIT 1;

    SELECT array_agg(id) INTO other_ids
    FROM pick_sessions
    WHERE tenant_id = dup.tenant_id
      AND outbound_order_no = dup.outbound_order_no
      AND id <> keep_id;

    -- Fold every box scan from the duplicate sessions into the canonical one.
    UPDATE pick_events SET session_id = keep_id WHERE session_id = ANY(other_ids);

    -- A box scanned 'ok' in more than one of the merged sessions is now duplicated under the
    -- same session — keep only the earliest 'ok' scan per box, demote the rest to 'duplicate'.
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

    -- Widest expected count and a location note across every duplicate.
    SELECT GREATEST(MAX(total_expected), 0),
           bool_or(status = 'with_discrepancies'),
           (array_remove(array_agg(ubicacion_nota ORDER BY (ubicacion_nota IS NOT NULL) DESC), NULL))[1]
    INTO merged_expected, has_discrepancy, merged_ubicacion
    FROM pick_sessions
    WHERE tenant_id = dup.tenant_id AND outbound_order_no = dup.outbound_order_no;

    -- Delete the duplicates BEFORE touching the canonical row's status — the open_per_order
    -- unique index would otherwise momentarily see two open rows for the same order.
    DELETE FROM pick_sessions WHERE id = ANY(other_ids);

    SELECT COALESCE(COUNT(DISTINCT REGEXP_REPLACE(
             UPPER(COALESCE(NULLIF(matched_box_type, ''), NULLIF(normalized_code, ''), NULLIF(scanned_code, ''))),
             '[^A-Z0-9]', '', 'g'
           )), 0)
    INTO merged_scanned
    FROM pick_events
    WHERE session_id = keep_id AND scan_result = 'ok';

    -- Status resolution: fully scanned always wins; otherwise only a genuine forced close
    -- (with_discrepancies) keeps that label — anything else that isn't finished is "en proceso".
    final_status := CASE
      WHEN merged_expected > 0 AND merged_scanned >= merged_expected THEN 'complete'
      WHEN has_discrepancy THEN 'with_discrepancies'
      ELSE 'open'
    END;

    UPDATE pick_sessions
    SET total_expected = merged_expected,
        total_scanned = merged_scanned,
        ubicacion_nota = COALESCE(ubicacion_nota, merged_ubicacion),
        status = final_status,
        completed_at = CASE WHEN final_status IN ('complete', 'with_discrepancies') THEN COALESCE(completed_at, now()) ELSE NULL END,
        updated_at = now()
    WHERE id = keep_id;
  END LOOP;
END $$;
