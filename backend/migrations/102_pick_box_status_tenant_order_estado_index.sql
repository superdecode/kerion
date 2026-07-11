-- pick_box_status has no index on (tenant_id, outbound_order_no), so the live
-- tiene_faltantes/tiene_anormalidades/tiene_reparacion/tiene_rastreo EXISTS checks
-- added to GET /scan-sessions and GET /order-tracking (replacing a stale cached
-- flag) each do a full sequential scan of the table — four of them per request.
CREATE INDEX IF NOT EXISTS idx_pick_box_status_tenant_order_estado
  ON pick_box_status (tenant_id, outbound_order_no, estado);

INSERT INTO schema_migrations (version, description)
VALUES ('102', 'pick_box_status_tenant_order_estado_index')
ON CONFLICT (version) DO NOTHING;
