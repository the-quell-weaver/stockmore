<!-- 這是用來產生 feature 文件用的模板文件。 -->

# Feature: <Feature Name>
- **Doc**: docs/features/uc/<feature-slug>.md
- **Status**: Draft | In Review | Approved
- **PRD linkage**: UC-<xx> (<PRD section / use-case name>)
- **Last updated**: YYYY-MM-DD

## 0. Summary
用 3–6 句描述這個 feature 要解決的問題、提供的能力、以及使用者獲得的價值。

## 1. Goals
- G1:
- G2:
- G3:

## 2. Non-Goals
- NG1:
- NG2:

## 3. Scope
### 3.1 MVP scope (must-have)
- S1:
- S2:

### 3.2 Out of scope / Backlog hooks (future)
列出「未來可能加，但本次不做」的內容，並說明要留哪些 extension points（例如欄位、事件型別、API 版本、UI slot）。

## 4. Users & Permissions
### 4.1 Personas / Roles
- owner / editor / viewer（或 MVP 先單人模式的等價假設）
- 角色差異（read/write）：

### 4.2 Multi-tenant constraints
- 所有資料必須綁 `org_id`（或等價）
- RLS 覆蓋哪些表、哪些操作（read/write）：

## 5. UX (Mobile-first)
### 5.1 Entry points
- 從哪裡進來（tab / list / CTA / deep link）：

### 5.2 Primary flow
用步驟描述 1 條「最常用」流程（手機優先）。
1.
2.
3.

### 5.3 Alternate / edge flows
- 空狀態（no data）
- 錯誤狀態（validation / permission / network）
- 大量資料情境（長列表、搜尋）

### 5.4 UI notes
- 表單欄位與預設值：
- 快速操作（one-handed / shortcuts）：
- 桌面版差異（如果需要）：

## 6. Data Model Impact
> 只寫「這個 feature 需要用到哪些資料與新增哪些欄位/表」，細節放 DATA_MODEL.md，但這裡要清楚列出影響範圍。

### 6.1 Entities touched
- Tables: <items>, <batches>, <transactions>...
- New columns (if any):
- New tables (if any):

### 6.2 Constraints & invariants
- 不可刪除（append-only / event sourcing 風格）規則：
- 數量規則（整數/小數限制）：
- referential integrity / unique keys：

### 6.3 RLS expectations (high level)
- 誰可以讀/寫哪些 rows：
- 以什麼方式確認 row 屬於 org：

## 7. Domain Rules
用條列寫「不可違反」的商業規則（避免把規則散落在 UI / DB triggers）。
- R1:
- R2:
- R3:

## 8. API / Server Actions
> 以 Next.js App Router + Supabase 的角度描述。若你用 server actions，就寫 actions；若用 route handlers，就寫 routes。

### 8.1 Endpoints / Actions
- `POST /api/...` or `action <name>()`
  - Request:
  - Response:
  - AuthZ:
  - Validation:
  - Failure modes (error codes/messages):

### 8.2 Idempotency / Concurrency
- 重複送出處理（避免雙擊造成雙交易）：
- 競態條件（同批次同時扣減/調整）：
- 交易一致性（transaction boundary）：

## 9. Jobs / Notifications (if applicable)
- 觸發條件：
- 頻率與去重：
- Email 模板變數：
- 觀測/失敗重試策略：

## 10. Export / Portability hooks (architecture requirement)
> 對齊 PRD 的雲端→自架→本地搬遷方向：這個 feature 的資料要怎麼被匯出、如何 replay、版本化策略。

- 需要被匯出的表/事件：
- 最小可重建資訊（schema version / org mapping / ids）：
- replay/rebuild 假設：
- 相容性/版本策略：

## 11. Telemetry / Auditability
- 需要記錄哪些 audit 欄位（created_at/by, source, note）：
- 需要的查詢/報表（若有）：

## 12. Acceptance Criteria
用「Given/When/Then」或條列，至少涵蓋：成功、權限、驗證、錯誤、邊界值。
- AC1:
- AC2:
- AC3:

## 13. Test Strategy (feature-level)
- Unit tests:
- Integration tests (DB + RLS):
- Minimal e2e (happy path):
- 需要的測試資料工廠/fixtures：

## 14. Rollout / Migration Plan (if applicable)
- DB migration steps:
- Backfill:
- Feature flag（要不要）：
- 回滾策略（資料不可逆時要特別寫）：

## 15. Open Questions
- Q1:
- Q2:
