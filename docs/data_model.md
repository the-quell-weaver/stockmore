# docs/DATA_MODEL.md（Template）

> 本文件定義資料模型（Postgres/Supabase）與資料層規則，作為 migrations / RLS / API 的共同基礎。
> **填寫原則**：只寫「能驅動實作與驗收」的最小資訊；細節以 schema / migrations 為準。

## 0. 文件目的與範圍

- 本文件涵蓋的功能範圍（對應哪些 UC）
  - UC_01 Auth & Onboarding（org/warehouse/membership bootstrap）
  - UC_02 Items（item master data + soft-delete）
- 本文件不涵蓋的項目（例如 UI 文案、第三方整合細節）
- 主要設計原則（multi-tenant、append-only transactions、可匯出/可搬遷）

## 1. 命名與慣例

- 主鍵型別（例如 `uuid`）
- UC_01：`uuid`
- 時間欄位（例如 `created_at`, `updated_at`）
- UC_01：`created_at`（timestamptz, default now())
- 外鍵命名（`org_id`, `warehouse_id`, `created_by`…）
- UC_01：`org_id`, `warehouse_id`, `created_by`, `owner_user_id`
- 列舉/狀態欄位（建議用 `text` + check 或 enum 的策略）
- UC_01：`role` 使用 `text`（MVP=owner）

## 2. Entity Relationship 概覽

- ERD 概述（文字描述即可；可補一張簡圖連結）
- UC_01：Org 1:n Membership；Org 1:n Warehouse（MVP 只允許 1 個預設）
- 核心 entity 與關聯：Org / Membership / Warehouse / Item / Transaction / …

## 3. 資料表一覽（Index）

- 表清單（表名 / 用途 / 主要 FK / 是否需要 RLS）
- 每張表對應到哪些 UC
- UC_01
  - `orgs`（RLS，FK: owner_user_id）
  - `org_memberships`（RLS，FK: org_id, user_id）
  - `warehouses`（RLS，FK: org_id）
- UC_02
  - `items`（RLS，FK: org_id, created_by, updated_by）

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

### 4.1 `orgs`

**Purpose**
- 租戶/組織根節點（UC_01）

**Columns（表格）**
- `id` | uuid | not null | gen_random_uuid() | PK | -
- `name` | text | not null | - | org 名稱 | Default Org
- `owner_user_id` | uuid | not null | - | auth.users | -
- `created_by` | uuid | not null | - | 建立者 | -
- `created_at` | timestamptz | not null | now() | 建立時間 | -

**Primary Key / Foreign Keys**
- PK: `id`
- FK: `owner_user_id` → `auth.users(id)` ON DELETE CASCADE
- FK: `created_by` → `auth.users(id)` ON DELETE CASCADE

**Constraints**
- UNIQUE(`owner_user_id`)（MVP 單人單 org、bootstrap idempotent）

**Indexes**
- `orgs_owner_user_id_key`（unique）

**Row Ownership / Tenant Keys**
- `org_id` = `orgs.id`

**Audit / History**
- `created_by`, `created_at`

### 4.2 `org_memberships`

**Purpose**
- user ↔ org 關聯（RBAC 擴充點）

**Columns（表格）**
- `id` | uuid | not null | gen_random_uuid() | PK | -
- `org_id` | uuid | not null | - | FK to orgs | -
- `user_id` | uuid | not null | - | FK to auth.users | -
- `role` | text | not null | 'owner' | 角色 | owner
- `created_at` | timestamptz | not null | now() | 建立時間 | -

**Primary Key / Foreign Keys**
- PK: `id`
- FK: `org_id` → `orgs(id)` ON DELETE CASCADE
- FK: `user_id` → `auth.users(id)` ON DELETE CASCADE

**Constraints**
- UNIQUE(`org_id`, `user_id`)

**Indexes**
- `org_memberships_org_user_key`（unique）
- `org_memberships_user_id_idx`

**Row Ownership / Tenant Keys**
- row belongs to `org_id`

**Audit / History**
- `created_at`

### 4.3 `warehouses`

**Purpose**
- 倉庫（MVP 只建立一筆預設倉庫）

**Columns（表格）**
- `id` | uuid | not null | gen_random_uuid() | PK | -
- `org_id` | uuid | not null | - | FK to orgs | -
- `name` | text | not null | - | 倉庫名稱 | Default Warehouse
- `is_default` | boolean | not null | true | 是否預設 | true
- `created_by` | uuid | not null | - | 建立者 | -
- `created_at` | timestamptz | not null | now() | 建立時間 | -

**Primary Key / Foreign Keys**
- PK: `id`
- FK: `org_id` → `orgs(id)` ON DELETE CASCADE
- FK: `created_by` → `auth.users(id)` ON DELETE CASCADE

**Constraints**
- UNIQUE(`org_id`) WHERE `is_default`（同 org 只能 1 個預設）

**Indexes**
- `warehouses_org_default_unique`（unique, partial）
- `warehouses_org_id_idx`

**Row Ownership / Tenant Keys**
- row belongs to `org_id`

**Audit / History**
- `created_at`, `created_by`

### 4.4 `items`

**Purpose**
- 品項主檔（UC_02），供後續入庫/消耗/盤點引用。

**Columns（表格）**
- `id` | uuid | not null | gen_random_uuid() | PK | -
- `org_id` | uuid | not null | - | FK to orgs | -
- `name` | text | not null | - | 品項名稱 | Drinking Water
- `unit` | text | not null | - | 顯示單位 | bottle
- `min_stock` | numeric(12,3) | not null | 0 | 最低庫存門檻 | 3
- `default_tag_id` | uuid | null | - | 單一預設標籤（UC_04 接續） | -
- `note` | text | null | - | 備註 | keep dry
- `is_deleted` | boolean | not null | false | soft-delete 標記 | false
- `created_by` | uuid | not null | - | 建立者 | auth.users.id
- `updated_by` | uuid | not null | - | 更新者 | auth.users.id
- `created_at` | timestamptz | not null | now() | 建立時間 | -
- `updated_at` | timestamptz | not null | now() | 更新時間 | -

**Primary Key / Foreign Keys**
- PK: `id`
- FK: `org_id` → `orgs(id)` ON DELETE CASCADE
- FK: `created_by` / `updated_by` → `auth.users(id)` ON DELETE RESTRICT

**Constraints**
- CHECK(`min_stock >= 0`)
- UNIQUE partial index: `(org_id, lower(name)) where is_deleted = false`

**Indexes**
- `items_org_id_idx`
- `items_org_name_search_idx`
- `items_org_name_active_unique`

**Row Ownership / Tenant Keys**
- row belongs to `org_id`

**Audit / History**
- 允許直接更新（master data），刪除採 soft-delete（`is_deleted`）

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
- UC_01：`supabase/migrations/20260221000000_uc01_bootstrap.sql`
- UC_01 PR#4：`supabase/migrations/20260222000000_uc01_rls_policies.sql` 補齊 `org_memberships` 的 update policy（owner 可更新本 org membership，維持多租戶隔離）。
- UC_02：`supabase/migrations/20260223000000_uc02_items.sql` 新增 `items`、role check（owner/editor/viewer）、items RLS 與 soft-delete 支援。

## 9. Seed / Fixtures（測試資料）

- 最小 seed 內容（哪些表必填）
- 測試用 fixture 生成策略（兩 org、兩 user 等）
- UC_01：integration tests 以 admin client 建立 user，呼叫 bootstrap RPC 建立 org/warehouse/membership
- UC_01 PR#4：新增兩帳號/兩 org fixture，驗證 RLS 阻擋跨租戶 select/insert/update（AC3）。

## 10. 附錄

- Glossary（名詞）
- 相關連結（Supabase schema、ERD 圖、SQL 檔案）
