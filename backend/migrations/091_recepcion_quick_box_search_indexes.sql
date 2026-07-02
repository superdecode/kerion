-- Migration 091: Indexes for Recepcion quick PDA lookup by box type / custom barcode
CREATE INDEX IF NOT EXISTS idx_inbound_lines_tenant_custom_box_barcode
  ON inbound_lines(tenant_id, custom_box_barcode);

CREATE INDEX IF NOT EXISTS idx_inbound_lines_tenant_box_type
  ON inbound_lines(tenant_id, box_type);

CREATE INDEX IF NOT EXISTS idx_inbound_scan_events_line_latest
  ON inbound_scan_events(tenant_id, order_id, line_id, scanned_at DESC);

