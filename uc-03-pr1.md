# UC-03 PR1 實作報告（T1 - T2）

## 範圍
本階段完成 `uc-03-tasks.md` 的：
- T1：DB Migration — 建立 `storage_locations` 表與 RLS 政策
- T2：Domain Layer — 錯誤碼、驗證邏輯與單元測試

另依 `uc-03-pr1-review.md` 補做 T1-1 修正（`updated_by`）。

## Commit 拆分

1. `4b70208` `feat(db): add UC-03 storage_locations schema and RLS`
- 新增 migration：`supabase/migrations/20260224000000_uc03_storage_locations.sql`
- 建立 `public.storage_locations`（含 FK、索引、大小寫無感 unique）
- 新增 `updated_at` 自動更新 trigger：`set_storage_locations_updated_at`
- 啟用 RLS，新增 `select` / `insert(owner,editor)` / `update(owner,editor)` policies
- 依 T1 要求不建立 delete policy（MVP 不允許刪除）
- 更新文件：`docs/data_model.md`
  - 補充 UC_03 範圍與資料表索引
  - 新增 `4.5 storage_locations` 規格
  - 補充 UC_03 migration 記錄

2. `e67c11e` `feat(storage-locations): add domain errors and validation rules`
- 新增錯誤碼與錯誤型別：`src/lib/storage-locations/errors.ts`
  - `LOCATION_NAME_REQUIRED`
  - `LOCATION_NAME_CONFLICT`
  - `LOCATION_NOT_FOUND`
  - `FORBIDDEN`
- 新增驗證：`src/lib/storage-locations/validation.ts`
  - `validateCreateLocationInput`
  - `validateRenameLocationInput`
  - 共同規則：`name.trim()` 後不可為空
- 新增單元測試：`src/lib/storage-locations/validation.unit.test.ts`
  - 覆蓋空字串、空白字串、trim 後回傳、rename 驗證

3. `6516800` `fix(storage-locations): add updated_by audit field and tighten RLS`
- 新增 migration：`supabase/migrations/20260224010000_uc03_storage_locations_updated_by.sql`
- 補上 `storage_locations.updated_by`（FK `auth.users`，`ON DELETE RESTRICT`，`NOT NULL`）
- backfill 既有資料：`updated_by = created_by`
- 強化 RLS：
  - insert policy：要求 `created_by = auth.uid()` 且 `updated_by = auth.uid()`
  - update policy：`with check` 增加 `updated_by = auth.uid()`
- 更新文件：`docs/data_model.md`
  - `storage_locations` 欄位與 FK 補上 `updated_by`
  - migration 清單新增 review fix 記錄
- 補充單元測試對稱性：
  - rename whitespace-only 驗證
  - rename trim 正規化驗證

## 測試與驗證

本階段已完成並通過：

- DB reset
```bash
npx supabase db reset
```

- Unit
```bash
npm --prefix src run test:unit
```

- Integration
```bash
npm --prefix src run test:integration
```

- E2E（依 agent 規範使用腳本）
```bash
scripts/testing/run-e2e.sh
```

## 與規格對齊

- `docs/features/uc_03_storage_locations.md`
  - §6（Data Model Impact）
  - §8.1（Error Codes：`LOCATION_NAME_REQUIRED` / `LOCATION_NAME_CONFLICT` / `LOCATION_NOT_FOUND` / `FORBIDDEN`）
- `uc-03-tasks.md`
  - T1 驗收：`storage_locations` schema + unique + RLS + `supabase db reset`
  - T2 驗收：validation + unit tests + 錯誤碼一致性

## 風險與回滾

- 風險
  - 新增資料表與 policy，若後續 service/action 未完成，功能入口尚不可用（屬預期分階段狀態）。
- 回滾
  - 程式碼層可回滾 commit。
  - DB migration 屬已套用變更，若需停用可先下線 UI/Server Action 入口；資料表保留不影響既有 UC。
