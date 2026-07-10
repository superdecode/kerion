-- Migration 094 consolidated duplicate pick_sessions rows, but the root cause (scan-session
-- only looking up sessions with status='open') kept creating new duplicates afterward whenever
-- an operator resumed an order whose session had already gone stale-complete. That lookup is
-- fixed now (wms.routes.js POST /scan-session), so this re-runs 094's same idempotent merge
-- logic once more to clean up the duplicates that accumulated in the meantime.
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

    UPDATE pick_events SET session_id = keep_id WHERE session_id = ANY(other_ids);

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

    SELECT GREATEST(MAX(total_expected), 0),
           bool_or(status = 'with_discrepancies'),
           (array_remove(array_agg(ubicacion_nota ORDER BY (ubicacion_nota IS NOT NULL) DESC), NULL))[1]
    INTO merged_expected, has_discrepancy, merged_ubicacion
    FROM pick_sessions
    WHERE tenant_id = dup.tenant_id AND outbound_order_no = dup.outbound_order_no;

    DELETE FROM pick_sessions WHERE id = ANY(other_ids);

    SELECT COALESCE(COUNT(DISTINCT REGEXP_REPLACE(
             UPPER(COALESCE(NULLIF(matched_box_type, ''), NULLIF(normalized_code, ''), NULLIF(scanned_code, ''))),
             '[^A-Z0-9]', '', 'g'
           )), 0)
    INTO merged_scanned
    FROM pick_events
    WHERE session_id = keep_id AND scan_result = 'ok';

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
