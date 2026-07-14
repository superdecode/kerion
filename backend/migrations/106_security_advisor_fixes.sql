-- Migration 106: Fix Supabase Security Advisor findings.
--
-- 1) bug_reports / system_error_events: created after migration 103's RLS sweep and
--    intentionally left out of that migration's tenant_tables array (they're read
--    cross-tenant by super-admin routes with no app.tenant_id set). But "excluded from
--    FORCE" was implemented as "never enabled at all", which leaves them fully exposed
--    to PostgREST's anon/authenticated roles once RLS is the only gate (schemas exposed
--    to PostgREST are public by default without it). The backend connects as `postgres`
--    with BYPASSRLS (verified), so enabling RLS here has zero effect on backend queries —
--    it only closes the direct PostgREST exposure. No policies are added: default-deny
--    is correct since these tables are only ever meant to be reached through the backend.
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_error_events ENABLE ROW LEVEL SECURITY;

-- 2) v_guias_completas: Postgres views run with the privileges of their owner (here,
--    `postgres`) unless security_invoker is set, regardless of RLS on the underlying
--    tarimas/guias/usuarios/configuraciones tables (all ENABLE+FORCE RLS since migration
--    022). That means a PostgREST caller querying the view directly bypassed tenant
--    isolation entirely. security_invoker (PG15+; this DB is on 17.6) makes the view
--    execute as the querying role, so the underlying tables' tenant_isolation policies
--    apply normally. The backend's BYPASSRLS role is unaffected either way.
ALTER VIEW public.v_guias_completas SET (security_invoker = on);

INSERT INTO schema_migrations (version, description)
VALUES ('106', 'security_advisor_fixes')
ON CONFLICT (version) DO NOTHING;
