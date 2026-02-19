<!-- Generated from template.md for UC-09 -->

# Feature: Notifications（到期 / 低庫存 Email 提醒：排程 + 去重）
- **Doc**: docs/features/notifications.md
- **Status**: Draft
- **PRD linkage**: UC-09（到期/低庫存 Email 提醒：依規則寄送並去重）
- **Owner**: TBD
- **Last updated**: 2026-02-19

## 0. Summary
本功能提供以 Email 為通路的「到期提醒」與「低庫存提醒」，協助使用者在平時維護防災物資：即將到期時提前通知、低於最低庫存時提醒補貨。提醒由排程工作（job）產生，必須具備**去重與頻率控制**以避免 spam；且所有判斷口徑需可由資料重播/重建支援未來雲端→自架→本地搬遷。MVP 預設規則：到期前 30/7/1 天提醒；低庫存每日最多一封（每個 org/倉庫）。

## 1. Goals
- G1: 使用者可啟用/停用到期提醒與低庫存提醒（以 org/warehouse 為範圍）。
- G2: 排程 job 依規則寄出 Email，並以去重/頻率控制避免重複寄送。
- G3: 提醒內容可讓使用者快速定位問題（哪些品項/批次快到期、哪些品項低於門檻）。

## 2. Non-Goals
- NG1: 不做多通路通知（SMS、推播、LINE 等）。
- NG2: 不做複雜規則編輯器（MVP 只提供預設規則與簡單開關）。
- NG3: 不做「到期日前自動移除/作廢批次」等自動處置。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: 通知設定（Notification Settings）：
  - enable_expiry_email (bool)
  - enable_low_stock_email (bool)
  - expiry_offsets_days = [30, 7, 1]（可先寫死；或存 DB）
  - low_stock_max_emails_per_day = 1（寫死或存 DB）
- S2: 排程 job：
  - 每日固定時間跑一次（以 org/warehouse 為單位）。
  - 掃描快到期批次（expiry_date 非空）與低庫存品項。
- S3: 去重：
  - 到期提醒：同一個 batch 在同一個 offset 只寄一次。
  - 低庫存提醒：同一個 org/warehouse 每日最多 1 封（可包含多個品項）。
- S4: Email 內容：
  - 到期：列出即將到期批次（品名、數量、到期日、存放點/標籤可選）
  - 低庫存：列出低於門檻的品項（品名、目前總量、最低庫存）

### 3.2 Out of scope / Backlog hooks (future)
- 自訂提醒天數、提醒寄送時間、或對不同品項設不同規則。
- 通知收件人管理（多人 org、不同角色不同收件人）。
- 通知中心（站內訊息）、讀取/已讀狀態。
- 低庫存的進階口徑（例如排除即將到期批次、或依存放點分開計算）。

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP：單人等價 owner。
- 未來：
  - owner：可調整通知設定
  - editor：可查看通知狀態（可選）
  - viewer：只讀（可查看設定，但不可修改，或 MVP 先不提供設定頁給 viewer）

### 4.2 Multi-tenant constraints
- 通知設定與寄送紀錄必須綁 `org_id`（建議同時綁 `warehouse_id`）。
- RLS 覆蓋：`notification_settings`, `notification_deliveries`（或等價）、以及讀取用的 `batches/items/transactions`。
- Job 執行使用 service role（繞過 RLS）但必須在應用層嚴格以 org/warehouse 範圍查詢。

## 5. UX (Mobile-first)
### 5.1 Entry points
- Settings：`提醒通知`。
- 空狀態提示：在 stock view 無到期日資料時，提示「填寫到期日可啟用提醒」。

### 5.2 Primary flow
1. 使用者進入 `提醒通知` 設定頁。
2. 開啟 `到期 Email 提醒` 與/或 `低庫存 Email 提醒`。
3. 系統在下一次排程時間點執行 job，若命中條件則寄出 Email。
4. 使用者收到 Email，點回系統（可先只導到 stock view；深連結為後續）。

### 5.3 Alternate / edge flows
- 到期日為空：永不提醒（即使啟用到期提醒）。
- 大量命中：Email 內容需有上限（例如最多列 50 筆），超過以「還有 N 筆」摘要（MVP 可先列全部但要注意長度）。
- Email 寄送失敗：需記錄失敗並重試（見 9）。
- 權限：viewer 若看到設定頁，切換開關需被拒絕。

### 5.4 UI notes
- 設定頁內容（MVP 最小）：
  - 兩個開關（到期/低庫存）
  - 文字說明：到期提醒固定 30/7/1 天；低庫存每日最多一封
- 桌面版：同頁面即可。

## 6. Data Model Impact
### 6.1 Entities touched
- Tables: `notification_settings`, `notification_deliveries`（建議新增）
- Read-only tables used by job: `items`, `batches`, `transactions`
- New columns (if any):
  - `notification_settings.org_id`, `warehouse_id`, `enable_expiry_email`, `enable_low_stock_email`, `created_at/by`, `updated_at/by`
  - `notification_deliveries.org_id`, `warehouse_id`, `type` ('expiry'|'low_stock'), `dedupe_key`, `status` ('sent'|'failed'|'skipped'), `sent_at`, `error_message?`, `payload_summary?`
- New tables (if any):
  - `notification_deliveries`（用於去重與稽核；強烈建議 MVP 就建立）

### 6.2 Constraints & invariants
- 去重關鍵：`notification_deliveries` 建 unique (org_id, dedupe_key)。
  - expiry dedupe_key 建議：`expiry:{batch_id}:{offset_days}:{expiry_date}`
  - low_stock dedupe_key 建議：`low_stock:{YYYY-MM-DD}`（以 org/warehouse 為範圍）
- 到期提醒：只考慮 `batches.expiry_date IS NOT NULL`。
- 低庫存口徑：以 item 為單位計算「目前總量」，並與 item.min_stock 比較（詳見 Domain Rules）。

### 6.3 RLS expectations (high level)
- `notification_settings`：owner 可 read/write；editor/viewer 可 read（MVP 可簡化）。
- `notification_deliveries`：owner 可 read；一般不允許 client insert（僅 job/service role）。
- row 屬於 org：row.org_id 與使用者 membership org_id 相符。

## 7. Domain Rules
- R1: 到期提醒只針對有填到期日的批次；未填者永不提醒。
- R2: 到期判斷：若 `today + offset_days == expiry_date`（以日期比對，不含時間）則命中。
- R3: 低庫存判斷：
  - 以 item 為聚合單位，計算該 item 之所有批次 `SUM(batches.quantity)` 作為 current_stock。
  - 當 `current_stock < items.min_stock` 時命中。
- R4: 低庫存提醒頻率控制：每個 org/warehouse 每日最多 1 封（可包含多個 item）。
- R5: 所有提醒必須可重播：通知本身不是交易事件，但其判斷必須僅依賴可匯出/可重建的資料（items/batches/transactions + settings + deliveries log）。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `action getNotificationSettings()`
  - Response: `{ settings }`
  - AuthZ: authenticated

- `action updateNotificationSettings(patch)`
  - Request: `{ enableExpiryEmail?, enableLowStockEmail? }`
  - Response: `{ settings }`
  - AuthZ: owner (或 owner/editor，視未來 RBAC)
  - Validation: boolean
  - Failure modes: `FORBIDDEN`, `VALIDATION_ERROR`

- `POST /api/jobs/notifications/run`（或等價 server job runner，需保護）
  - AuthZ: service role / cron secret
  - Behavior: 依所有啟用的 org/warehouse 掃描 → 產生 Email → 寫入 deliveries log
  - Failure modes: `UNAUTHORIZED`, `JOB_FAILED`

### 8.2 Idempotency / Concurrency
- job 具備天然 idempotency：
  - 寄送前先嘗試 insert delivery row（以 dedupe_key unique）成功才寄送；若 unique conflict 則 skip。
- 同一時間多個 job 併發：
  - 以 DB unique constraint 保證只會有一個成功插入 dedupe_key。
- 交易一致性：
  - 建議流程：`insert delivery(status='pending') -> send email -> update delivery(status='sent'|'failed')`。

## 9. Jobs / Notifications (if applicable)
- 觸發條件：
  - Expiry：expiry_date 命中 offsets_days
  - Low stock：item current_stock < min_stock
- 頻率與去重：
  - Expiry：每個 batch/offset/expiry_date 只寄一次
  - Low stock：每個 org/warehouse 每天最多 1 封
- Email 模板變數（MVP 建議）：
  - `org_name`, `warehouse_name`
  - `items[]`: `{ item_name, current_stock?, min_stock? }`
  - `batches[]`: `{ item_name, quantity, expiry_date, storage_location_name?, tags? }`
  - `app_url`（導回 stock view）
- 觀測/失敗重試策略：
  - delivery 記錄 status + error_message
  - 失敗可在下一輪 job 以「相同 dedupe_key + status=failed」是否重試：
    - MVP 建議：允許重試，但需限制次數（例如 retries<=3）並記錄 last_attempt_at。

## 10. Export / Portability hooks (architecture requirement)
- 需要被匯出的表/事件：
  - `notification_settings`
  - `notification_deliveries`（建議匯出，避免搬遷後重複寄送；至少要能重建 dedupe 狀態）
  - 以及依賴資料：`items`, `batches`, `transactions`
- 最小可重建資訊：schema_version、org/warehouse ids、settings 值、deliveries(dedupe_key, status, sent_at)。
- replay/rebuild 假設：
  - 匯入端若保留 deliveries，可避免搬遷後同一天/同 offset 重複提醒。
  - 若不匯出 deliveries，則需明確告知「搬遷後可能會重新寄送一次提醒」的產品行為（不建議）。
- 相容性/版本策略：
  - dedupe_key 格式需版本化或固定規則；變更規則時需支援舊 key 的兼容（例如加 prefix v1/v2）。

## 11. Telemetry / Auditability
- 必要稽核：每次寄送/失敗都寫 deliveries（sent_at, status, error）。
- 需要的查詢/報表：
  - 最近 30 天寄送紀錄
  - 依 org/warehouse 統計成功/失敗

## 12. Acceptance Criteria
- AC1: Given 啟用到期提醒 And 存在 expiry_date=今天+7 的批次 When job 執行 Then 寄出 1 封到期提醒 Email，且 deliveries 寫入 sent。
- AC2: Given 同一批次同一 offset 已寄送過 When job 再次執行 Then 不會重複寄送（因 dedupe_key 衝突而 skip）。
- AC3: Given 啟用低庫存提醒 And 某 item current_stock < min_stock When job 執行 Then 寄出 1 封低庫存提醒 Email（可包含多個 items）。
- AC4: Given 同 org/warehouse 今日已寄出低庫存提醒 When job 再次執行 Then 今日不再寄送第二封。
- AC5: Given viewer When 嘗試修改通知設定 Then 被拒絕（FORBIDDEN）。

## 13. Test Strategy (feature-level)
- Unit tests:
  - expiry match 計算（offset 30/7/1）
  - low stock 聚合計算（sum batches）
  - dedupe_key 生成
- Integration tests (DB + RLS):
  - owner 可更新 settings；viewer 不可
  - deliveries unique constraint 行為
- Minimal e2e:
  - 建 item + 入庫含 expiry_date → 啟用提醒 → 觸發 job（測試環境可用手動 endpoint）→ 驗證 deliveries + email mock
- Fixtures:
  - org + warehouse + user
  - items/batches/transactions

## 14. Rollout / Migration Plan (if applicable)
- DB migration steps:
  - 建立 `notification_settings`（每 org/warehouse 一筆，或由 bootstrap 建預設）
  - 建立 `notification_deliveries` + unique(org_id, dedupe_key)
- Backfill:
  - 對既有 org 建預設 settings（預設 off 或 on 由產品決策；MVP 建議預設 off，避免突然寄信）
- Feature flag：可選（例如先對內測 org 開啟 job）。
- 回滾策略：停用 cron/job 入口；保留 deliveries 以避免未來重開後重寄。

## 15. Open Questions
- Q1: MVP 預設通知開關要預設開或關？（建議：預設關，使用者明確啟用後才寄送。）
- Q2: 低庫存的聚合口徑是否以 warehouse 為範圍（建議：是），以及是否要排除 quantity=0 的批次？
- Q3: Email 寄送服務選型（Supabase/Resend/SMTP）與測試環境的 mock 策略。

