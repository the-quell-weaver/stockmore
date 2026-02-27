# UC-10 Current State: CI/CD + Supabase Migrations

- Source spec: `docs/features/archived/uc_10_ci_cd_supabase_migrations.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Current Behavior
- DB schema/RLS/policy 變更以 `supabase/migrations/*.sql` 管理。
- PR 階段會執行 CI 驗證（含 migration 可重播、測試與建置）。
- `main` 合併後會將 migrations 佈署到 staging。
- production migrations 以手動觸發與 reviewer gate 控制，不自動推送。

## 2. Delivery Pipelines (Current)
- PR CI：
  - lint / typecheck / tests
  - `supabase start` + `supabase db reset`
  - build 與最小 e2e smoke
- Staging deploy：
  - `push main` 且 migration 變更時執行
  - 使用 `supabase db push --db-url ...` 佈署
- Production deploy：
  - `workflow_dispatch` 手動啟動
  - 配合 GitHub Environment reviewers

## 3. Policy / Safety Rules
- 不在 Vercel build 階段執行 migrations。
- 避免直接在 production dashboard 手動改 schema（緊急例外需補回 migration）。
- 若 staging migrations 失敗，不應進行 production migrations。
