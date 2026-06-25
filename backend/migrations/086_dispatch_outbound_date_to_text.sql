-- Change outbound_date from DATE to TEXT so the full WMS datetime string
-- (including time component) can be stored and displayed on folio prints.
ALTER TABLE dispatch_folio_orders
  ALTER COLUMN outbound_date TYPE TEXT
  USING outbound_date::text;

INSERT INTO schema_migrations (version, description)
VALUES ('086', 'dispatch_outbound_date_to_text') ON CONFLICT (version) DO NOTHING;
