-- Migration 085: Add outbound_date to dispatch_folio_orders
-- Stores the WMS delivery/outbound date per order, separate from created_at.

ALTER TABLE dispatch_folio_orders
  ADD COLUMN IF NOT EXISTS outbound_date DATE;

INSERT INTO schema_migrations (version, description)
VALUES ('085', 'dispatch_folio_orders_outbound_date')
ON CONFLICT (version) DO NOTHING;
