-- Add CHECK constraint on transactions.type to enforce valid values at the
-- DB level.  All writes go through security-definer RPCs that only insert
-- valid types, so this constraint should never be violated in practice.
-- Adding it as a defensive guard against direct inserts that bypass RPCs
-- (e.g. future tooling, data migrations, or accidental direct writes via
-- service-role key).

begin;

alter table public.transactions
  add constraint transactions_type_valid
  check (type in ('inbound', 'consumption', 'adjustment'));

commit;
