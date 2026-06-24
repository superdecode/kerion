-- Migration 084: Bug reports table for in-app feedback/issue reporting
CREATE TABLE IF NOT EXISTS bug_reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES tenants(id) ON DELETE SET NULL,
  tenant_name TEXT,
  user_email  TEXT,
  user_name   TEXT,
  description TEXT        NOT NULL,
  page_url    TEXT,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'reviewing', 'resolved')),
  admin_notes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_tenant_id  ON bug_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status     ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);
