# Supabase directory

- `supabase/migrations/` stores all schema-related SQL migrations.
- Any schema/RLS/policy/index/constraint change must be committed as a new SQL file in `supabase/migrations/*.sql`.
- Do not edit production schema directly from the dashboard. Emergency hotfixes must be backfilled with a migration.
