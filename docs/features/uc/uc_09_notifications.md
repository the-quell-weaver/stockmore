<!-- Generated from template.md for UC-09 -->

# Feature: Expiry Calendar Export（到期行事曆匯出）
- **Doc**: docs/features/uc/uc_09_notifications.md
- **Status**: Draft
- **PRD linkage**: UC-09（庫存到期通知：行事曆匯出 / subscribe）
- **Owner**: TBD
- **Last updated**: 2026-02-27

## 0. Summary
本功能聚焦在「庫存到期通知的行事曆匯出」，目標是提供可被主流行事曆系統解析的標準檔案，讓到期資訊可被外部工具使用。

MVP 僅處理到期事件匯出：
- 支援 `.ics`（或等價 iCalendar）格式。
- 事件內容至少包含：品項名稱、到期日、數量、存放點（可選）。

> 其餘通知規格（Email 到期提醒、低庫存提醒、排程 job、寄送去重等）已搬移到 future work 文件：
> `docs/features/uc/uc_09_notifications_future_work.md`

## 1. Goals
- G1: 使用者可匯出可被主流行事曆服務讀取的到期事件檔案。
- G2: 同一批次/同一提醒 offset 的事件識別資訊穩定，避免重複建立無限筆事件。

## 2. Non-Goals
- NG1: 不包含 Email 到期提醒。
- NG2: 不包含低庫存提醒。
- NG3: 不包含訂閱 feed URL。
- NG4: 不包含排程寄信、寄送失敗重試與通知中心。

## 3. Scope
### 3.1 MVP scope (must-have)
- S1: 匯出到期提醒事件為 `.ics`（或等價格式）。
- S2: 事件內容至少包含：
  - 品項名稱
  - 到期日
  - 數量
  - 存放點（可選）
- S3: 事件識別資訊（UID / dedupe key）穩定，可被客戶端去重更新。
- S4: 文件需明確定義事件內容的生成規則（含 offset、日期口徑、欄位映射）。

### 3.2 Future work
所有非 MVP 匯出範圍（包含訂閱 feed、Email 到期提醒、低庫存提醒、排程 job、寄送去重與稽核）統一收斂於：

- `docs/features/uc/uc_09_notifications_future_work.md`

## 4. Users & Permissions
### 4.1 Personas / Roles
- MVP：單人等價 owner。
- 未來若導入 RBAC：
  - owner/editor 可存取匯出資訊。
  - viewer 權限依產品策略決定（可讀或不可見）。

### 4.2 Multi-tenant constraints
- 行事曆匯出資料必須綁 `org_id`（建議同時綁 `warehouse_id`）。
- 匯出 API 不可信任 client 傳入 `org_id`，需由 session/membership 推導。

## 5. UX (Mobile-first)
### 5.1 Entry points
- Stock View 或提醒設定頁提供「匯出行事曆」入口。

### 5.2 Primary flow
1. 使用者開啟「到期行事曆匯出」。
2. 系統提供下載 `.ics`。
3. 使用者將檔案交由外部行事曆工具使用（匯入/解析行為屬外部系統責任）。

### 5.3 Alternate / edge flows
- 無到期資料：仍回傳合法空行事曆。
- 到期日為空：不產生事件。
- 大量事件：可依時間窗限制匯出筆數（如 90/180/365 天）避免檔案過大。

## 6. Data Model Impact
### 6.1 Entities touched
- Read-only: `items`, `batches`, `storage_locations`（若有）

### 6.2 Constraints & invariants
- 同一批次 + 同一 offset 的事件 UID 必須穩定。
- 事件時間/日期需一致採用明確時區策略（建議 UTC date-only + consumer local rendering）。

## 7. Business Rules
- R1: 只有 `expiry_date` 非空的批次會產生事件。
- R2: offset 規則使用固定集合（MVP 建議 30/7/1 天）。
- R3: 事件主旨至少可識別品項名稱與到期日。
- R4: 匯出結果必須符合 iCalendar 規範，並可被常見行事曆客戶端解析。
- R5: 每個事件欄位需有明確來源與生成方式（item/batch/storage location 映射）。

## 8. API / Server Actions
### 8.1 Endpoints / Actions
- `GET /api/calendar/expiry.ics`
  - 回傳 iCalendar 檔案內容。
  - AuthZ：authenticated。

### 8.2 Idempotency / Concurrency
- 匯出屬 read-only；重複呼叫應回傳一致結構。
- 事件 UID 穩定，供客戶端以 update 取代 duplicate insert。

## 9. Export / Portability hooks (architecture requirement)
- 到期事件需可由可攜資料重建（`items`/`batches`）。

## 10. Telemetry / Auditability
- 最低限度記錄匯出請求成功率與錯誤率。
- 監控主要錯誤：權限失敗、格式生成失敗、資料異常（無效日期）。

## 11. Acceptance Criteria
- AC1: Given 有快到期批次（today+30/7/1）When 下載 `.ics` Then 產生的事件內容符合欄位規範且可被主流行事曆客戶端解析。
- AC2: Given 同一批次同一 offset When 重複匯出 Then 事件 UID 保持一致。
- AC3: Given 某批次無 `expiry_date` When 匯出 Then 不會出現在行事曆事件中。
- AC4: Given 無任何到期批次 When 匯出 Then 回傳合法且可解析的空行事曆。
- AC5: Given 任一事件欄位（summary/description/date/uid）When 檢查生成規則 Then 可追溯到對應資料來源與固定生成邏輯。

## 12. Test Strategy (feature-level)
- Unit tests:
  - offset 計算（30/7/1）
  - iCalendar event builder（UID 穩定性、欄位完整性）
- Integration tests:
  - API auth 與 org/warehouse 隔離
  - `.ics` 回應格式合法性
- Minimal e2e:
  - 建 item + batch(expiry_date) → 匯出 `.ics` → 驗證內容可解析且欄位映射正確

## 13. Rollout / Migration Plan (if applicable)
- 可先以 feature flag 對內測 org 開啟。

## 14. Open Questions
- Q1: 匯出事件時間窗預設值（全部 / 180 天 / 365 天）？
- Q2: offset 固定 30/7/1 是否在 MVP 鎖定，不提供 UI 設定？
