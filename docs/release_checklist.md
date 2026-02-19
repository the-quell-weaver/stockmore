# docs/RELEASE_CHECKLIST.md

> 目的：降低「環境設定 / migrations / RLS / Auth redirect」造成的上線事故。每次佈署到 Preview/Production 前後都照表做。

## 0. 版本與變更範圍

- [ ] 本次 release 的 PRs 都已合併至 main。
- [ ] migrations 已合併，且本機/CI 能從空 DB 重建成功。
- [ ] 有對應的 feature 文件（docs/features/uc_0X_*.md）更新。

## 1. 環境變數（Vercel）

**Preview + Production 都要檢查**：
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] （若需要）`SUPABASE_SERVICE_ROLE_KEY`（僅 server-side 使用，不可曝露到 client）
- [ ] （若有）任務排程/通知相關 env（例如 mail provider key）

> 原則：Preview 與 Production 的 Supabase project 可分開，避免測試資料污染。

## 2. Supabase Auth 設定

- [ ] **Site URL** 設定正確（Production 網域）。
- [ ] **Redirect URLs** 已包含：
  - [ ] 本機 `http://localhost:3000/auth/callback`
  - [ ] Preview domain `https://*.vercel.app/auth/callback`
  - [ ] Production domain `https://<your-domain>/auth/callback`
- [ ] Email magic link 的 `redirectTo` 會落在 `/auth/callback`。

## 3. Database / Migrations / RLS

- [ ] migrations 已在目標 Supabase project 套用成功。
- [ ] **所有表都已啟用 RLS**（multi-tenant 資料表必須）。
- [ ] RLS policies 覆蓋：select/insert/update（以及必要時 delete 的明確禁止）。
- [ ] 用兩個不同帳號快速驗證：A 看不到 B 的資料。

## 4. 關鍵功能 Smoke Test（手動 5 分鐘版）

- [ ] 未登入訪問 `/stock` 會導到 `/login`。
- [ ] 登入流程可完成（寄送 magic link → callback → landing page）。
- [ ] `/stock` 可正常載入目前倉庫/庫存列表（即使是空狀態）。
- [ ] （若已做 UC-02/05/06）新增品項、入庫/出庫/調整任一流程可走通。

## 5. Observability / Debug

- [ ] Vercel Logs 無明顯 error（特別是 auth callback、middleware、server actions）。
- [ ] Supabase Logs / Auth logs 無大量失敗。

## 6. 回滾策略（最低限度）

- [ ] 如為純前端/路由問題：可回滾到前一個 Vercel deployment。
- [ ] 如包含 DB migrations：
  - [ ] migrations 設計為可向前相容（避免破壞性變更），必要時提供修復 migration。
  - [ ] 避免在 MVP 做不可逆的 drop/rename（除非同 PR 已含資料遷移）。

## 7. 上線後確認

- [ ] Production 真實帳號登入測一次。
- [ ] 至少建立 1 個 org/warehouse（若 UC-01 有 bootstrap）並確認不會重複建立。
- [ ] 低庫存/到期提醒（若已上）確認排程與去重邏輯符合預期（可先用測試資料觸發）。

