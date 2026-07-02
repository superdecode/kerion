-- Migration 090: Centralized technical error events for Super Admin observability
CREATE TABLE IF NOT EXISTS system_error_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  tenant_slug     TEXT,
  user_id         UUID,
  user_email      TEXT,
  source          TEXT        NOT NULL DEFAULT 'frontend'
                  CHECK (source IN ('frontend', 'api', 'react', 'global', 'backend')),
  severity        TEXT        NOT NULL DEFAULT 'error'
                  CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  status          TEXT        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'reviewing', 'resolved', 'ignored')),
  fingerprint     TEXT,
  message         TEXT        NOT NULL,
  stack           TEXT,
  component_stack TEXT,
  page_url        TEXT,
  route           TEXT,
  http_method     TEXT,
  http_status     INTEGER,
  api_url         TEXT,
  user_agent      TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  occurrences     INTEGER     NOT NULL DEFAULT 1,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID,
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_error_events_tenant      ON system_error_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_error_events_status      ON system_error_events(status);
CREATE INDEX IF NOT EXISTS idx_system_error_events_severity    ON system_error_events(severity);
CREATE INDEX IF NOT EXISTS idx_system_error_events_source      ON system_error_events(source);
CREATE INDEX IF NOT EXISTS idx_system_error_events_last_seen   ON system_error_events(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_error_events_fingerprint ON system_error_events(fingerprint);

