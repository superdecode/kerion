# Supabase Migrations

Kirion is still on a legacy migration layout:

- Active legacy directory: `backend/migrations/`
- Legacy runner: `backend/scripts/run-migration.js`
- Tracking table: `public.schema_migrations`
- No `supabase/config.toml` or linked Supabase CLI project is present in this repo.

Do not add a second migration directory or run permanent schema changes in the Supabase dashboard SQL editor.

## Current Risk

The repository does not yet satisfy the target rule of a single CLI-managed `supabase/migrations/` directory. Converting it safely requires access to the linked Supabase project and a verified migration-history cutover, because production history already exists under numeric versions such as `001` through `089`.

There are also duplicate legacy numeric prefixes in the current directory, for example `062` and `073`. The legacy runner extracts only the numeric prefix, so new duplicate prefixes must not be added.

## Safe Cutover Plan

1. Link the project from the repo root:

```bash
supabase init
supabase link --project-ref <project-ref>
```

2. Verify current remote history before moving files:

```bash
supabase migration list --linked
```

3. Create a one-time baseline strategy:

- Either keep `backend/migrations/` frozen and create future timestamped migrations only in `supabase/migrations/`.
- Or convert the legacy history into `supabase/migrations/` and repair remote migration history to match the chosen versions.

Do not mix both strategies without repairing remote history.

4. For every new schema change after cutover:

```bash
supabase migration new descriptive_name
supabase db push --linked
supabase migration list --linked
supabase inspect db index-stats --linked
```

## Index Checklist

Every table created or heavily queried should have indexes for common filters:

- Tenant filters: `tenant_id`, or composite `(tenant_id, status)`, `(tenant_id, created_at)`.
- Foreign keys used in child lookups, for example `user_id`, `session_id`, `folio_id`, `order_id`.
- Status and date filters, for example `status`, `estado`, `created_at`, `updated_at`.

PostgreSQL creates indexes for primary keys, but not automatically for foreign-key columns.
