-- Speed up validation opening: the UI loads successful scan history by order
-- while the order lines load in parallel.
CREATE INDEX IF NOT EXISTS idx_inbound_scan_events_order_result_scanned
  ON inbound_scan_events(tenant_id, order_id, resultado, scanned_at DESC, id DESC);
