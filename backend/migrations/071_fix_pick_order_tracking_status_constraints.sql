-- Remove legacy status constraints left behind by the upapex -> pick_order_tracking rename.
-- Some databases still carry the old check constraint name, which blocks newer
-- statuses like 'partial' and 'cancelled' even though the current table should allow them.

ALTER TABLE pick_order_tracking
  DROP CONSTRAINT IF EXISTS upapex_order_tracking_status_check;

ALTER TABLE pick_order_tracking
  DROP CONSTRAINT IF EXISTS pick_order_tracking_status_check;

ALTER TABLE pick_order_tracking
  ADD CONSTRAINT pick_order_tracking_status_check
  CHECK (status IN (
    'pending_assignment',
    'assigned',
    'sorting',
    'pending_validation',
    'validating',
    'complete',
    'partial',
    'cancelled'
  ));

INSERT INTO schema_migrations (version, description)
VALUES ('071', 'fix_pick_order_tracking_status_constraints')
ON CONFLICT (version) DO NOTHING;
