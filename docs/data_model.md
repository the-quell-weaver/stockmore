# docs/DATA_MODEL.md（Template）

> 本文件定義資料模型（Postgres/Supabase）與資料層規則，作為 migrations / RLS / API 的共同基礎。
> **填寫原則**：只寫「能驅動實作與驗收」的最小資訊；細節以 schema / migrations 為準。

## 0. 文件目的與範圍

- 本文件涵蓋的功能範圍（對應哪些 UC）
  - UC_01 Auth & Onboarding（本 PR 無 schema 變更）
- 本文件不涵蓋的項目（例如 UI 文案、第三方整合細節）
- 主要設計原則（multi-tenant、append-only transactions、可匯出/可搬遷）

## 1. 命名與慣例

- 主鍵型別（例如 `uuid`）
- 時間欄位（例如 `created_at`, `updated_at`）
- 外鍵命名（`org_id`, `warehouse_id`, `created_by`…）
- 列舉/狀態欄位（建議用 `text` + check 或 enum 的策略）

## 2. Entity Relationship 概覽

- ERD 概述（文字描述即可；可補一張簡圖連結）
- 核心 entity 與關聯：Org / Membership / Warehouse / Item / Transaction / …

## 3. 資料表一覽（Index）

- 表清單（表名 / 用途 / 主要 FK / 是否需要 RLS）
- 每張表對應到哪些 UC

## 4. 各資料表規格（逐表）

> 每張表用相同格式，方便新增/維護。

### 4.x `<table_name>`

**Purpose**
- 這張表解決什麼問題、被哪些 UC 使用

**Columns（表格）**
- 欄位名 | 型別 | nullable | default | 說明 | 範例

**Primary Key / Foreign Keys**
- PK 說明
- FK：引用表、ON DELETE/UPDATE 策略

**Constraints**
- UNIQUE / CHECK / NOT NULL 的理由與影響

**Indexes**
- index 欄位與理由（查詢熱點、排序需求）

**Row Ownership / Tenant Keys**
- `org_id` / `warehouse_id` 的歸屬與保證方式

**Audit / History**
- 是否需要 `created_by`、是否 append-only、是否需要作廢/沖銷欄位

## 5. 關鍵查詢與存取模式

- 主要頁面/流程對 DB 的 read patterns（列表、篩選、聚合）
- write patterns（入/出/調整）與一致性需求

## 6. 聚合與顯示規則（若適用）

- UI/紙本聚合鍵的定義（分層聚合、可配置維度）
- 對資料模型的影響（是否需要 materialized view / computed fields）

## 7. Transactions 設計（若適用）

- 交易類型（inbound/outbound/adjust/void/reversal…）
- append-only 原則如何落地（禁止 delete、修正方式）
- 庫存計算策略（即時計算/快取/視圖）

## 8. Migrations 與相容性策略

- migrations 檔案位置與規範
- 可向前相容原則（避免破壞性變更）
- 資料遷移策略（rename/drop 的流程）

## 9. Seed / Fixtures（測試資料）

- 最小 seed 內容（哪些表必填）
- 測試用 fixture 生成策略（兩 org、兩 user 等）

## 10. 附錄

- Glossary（名詞）
- 相關連結（Supabase schema、ERD 圖、SQL 檔案）
