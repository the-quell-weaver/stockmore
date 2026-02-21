# docs/SECURITY.md（Template）

> 本文件描述安全模型：多租戶隔離、角色權限、RLS 政策、敏感操作與 secrets 管理。
> **填寫原則**：以「可驗證」為中心，任何規則都應能在 integration tests 中被證明。

## 0. 文件目的與威脅模型（簡版）

- 我們要防什麼（跨 org 讀寫、偽造 org_id、越權操作、資料外洩）
- 我們不處理什麼（例如 DDoS、WAF 層）

## 1. 身份與會話（Auth）

- 登入方式：Email magic link（Supabase Auth）
- session 取得方式：server-side cookies（`supabase.auth.verifyOtp`）與 client-side session
- callback 與 cookie/session 的責任邊界
  - `/auth/callback` 只負責驗證 token 並建立 session
  - 不在 URL 或 log 中保存 token（避免洩漏）

> Auth URL（Site URL / Redirect allowlist）設定細節請見 `docs/testing_guide.md` 的「Production Auth URL 設定（Supabase）」。

## 2. 多租戶模型（Tenant Isolation）

- Tenant key（`org_id`）的定義
- `warehouse_id` 的角色（若適用）
- 任何資料如何綁定 tenant（資料表層面的一致規則）
- UC_01：`orgs`, `warehouses` 透過 `org_memberships` 綁定 `auth.uid()`

## 3. 角色與權限模型（RBAC）

- 角色清單（owner/editor/viewer 或等價）
- 角色能力矩陣（表格）：
  - 資料層（select/insert/update/delete）
  - 功能層（建立 org、邀請成員、交易、匯入匯出…）

## 4. RLS 策略總覽（必填）

- 哪些表啟用 RLS（表清單）
- 每張表的 access rule 概述（文字）
- 禁止 client 偽造 tenant key 的策略（例如 org_id 只能從 membership 推導）
- UC_01：`orgs`, `org_memberships`, `warehouses` 啟用 RLS

## 5. RLS Policies 規格（逐表）

> 每張表用相同格式。

### 5.x `<table_name>`

- **Row ownership rule**：row 屬於誰/哪個 org
- **Select policy**：條件描述（以 `auth.uid()` 與 membership 判斷）
- **Insert policy**：允許誰新增、必要欄位、禁止偽造方式
- **Update policy**：允許誰更新、哪些欄位不可改（如 org_id）
- **Delete policy**：是否禁止；若允許需明確理由
- **Notes**：特殊情況（system jobs、service role）

### 5.1 `orgs`

- **Row ownership rule**：存在 `org_memberships` 且 `user_id = auth.uid()`
- **Select policy**：org member 可讀
- **Insert policy**：`owner_user_id = auth.uid()` 且 `created_by = auth.uid()`
- **Update policy**：僅 owner（`owner_user_id = auth.uid()`）
- **Delete policy**：未開放

### 5.2 `org_memberships`

- **Row ownership rule**：`user_id = auth.uid()`
- **Select policy**：使用者可讀自己的 membership
- **Insert policy**：僅允許 `user_id = auth.uid()`，且 `org_id` 必須屬於 `auth.uid()` 的 org
- **Update policy**：未開放
- **Delete policy**：未開放

### 5.3 `warehouses`

- **Row ownership rule**：`org_id` 必須有 membership 且 `user_id = auth.uid()`
- **Select policy**：org member 可讀
- **Insert policy**：org member 可寫入，且 `created_by = auth.uid()`
- **Update policy**：org member 可更新
- **Delete policy**：未開放

## 6. Service Role / Jobs / Server-only Operations

- 哪些操作必須使用 service role（若有）
- server actions 與後端 job 的權限來源
- jobs 如何避免跨 org 誤處理（filter by org_id）

## 7. 敏感資料與隱私

- PII 範圍（email、name 等）
- 日誌與追蹤（避免記錄 secrets、避免記錄完整 token）
- 資料匯出/備份時的保護（可選）

## 8. Secrets 與環境變數管理

- 必要 env vars 清單（client vs server）
- 哪些 key 絕不能曝露到 client
- Preview / Production 的分離策略

## 9. 安全驗證清單（可測）

- 手動驗證步驟（兩帳號、兩 org）
- integration tests 應覆蓋的案例清單（RLS、越權、偽造）

## 10. Incident / 回應流程（簡版）

- 發現資料越權時：立即措施（關閉入口、回滾、撤銷 key）
- 後續修補：補測試、補文件
