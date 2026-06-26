-- Speed up paginated reception order detail reads.
CREATE INDEX IF NOT EXISTS idx_inbound_lines_order_created_at
  ON inbound_lines(tenant_id, order_id, created_at ASC, id ASC);

