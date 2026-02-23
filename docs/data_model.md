# docs/DATA_MODEL.md（Template）

> 本文件定義資料模型（Postgres/Supabase）與資料層規則，作為 migrations / RLS / API 的共同基礎。
> **填寫原則**：只寫「能驅動實作與驗收」的最小資訊；細節以 schema / migrations 為準。

## 0. 文件目的與範圍

- 本文件涵蓋的功能範圍（對應哪些 UC）
  - UC_01 Auth & Onboarding（org/warehouse/membership bootstrap）
  - UC_02 Items（item master data + soft-delete）
  - UC_03 Storage Locations（存放點字典：新增/改名）
  - UC_04 Tags（標籤字典）
  - UC_05 Transactions Inbound（入庫批次與交易紀錄）
  - UC_06 Transactions Consumption（消耗扣減，支援小數數量）
  - UC_07 Transactions Adjustment（盤點調整，含 quantity_after 快照欄位）
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
- UC_03
  - `storage_locations`（RLS，FK: org_id, warehouse_id, created_by, updated_by）
- UC_04
  - `tags`（RLS，FK: org_id, warehouse_id, created_by, updated_by）
- UC_05
  - `batches`（RLS SELECT only，FK: org_id, warehouse_id, item_id, storage_location_id, tag_id, created_by；寫入僅透過 RPC）
  - `transactions`（RLS SELECT only，FK: org_id, warehouse_id, batch_id, item_id, created_by；append-only，寫入僅透過 RPC）

> **UC_06 型別變更**（migration 20260227000000）：`batches.quantity` 與 `transactions.quantity_delta` 已由 `integer` 改為 `numeric`，以支援小數消耗。入庫驗證層仍強制整數（> 0），但欄位本身可存小數。
>
> **UC_07 新欄位**（migration 20260228000000）：`transactions.quantity_after numeric null`——adjustment 事件寫入實際數量快照；inbound/consumption 行為 null（不回填）。

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

### 4.5 `storage_locations`

**Purpose**
- 存放點字典（UC_03），供入庫與庫存顯示引用。

**Columns（表格）**
- `id` | uuid | not null | gen_random_uuid() | PK | -
- `org_id` | uuid | not null | - | FK to orgs | -
- `warehouse_id` | uuid | not null | - | FK to warehouses | -
- `name` | text | not null | - | 存放點名稱 | 客廳櫃子
- `created_by` | uuid | not null | - | 建立者 | auth.users.id
- `updated_by` | uuid | not null | - | 最後更新者 | auth.users.id
- `created_at` | timestamptz | not null | now() | 建立時間 | -
- `updated_at` | timestamptz | not null | now() | 更新時間 | -

**Primary Key / Foreign Keys**
- PK: `id`
- FK: `org_id` → `orgs(id)` ON DELETE CASCADE
- FK: `warehouse_id` → `warehouses(id)` ON DELETE CASCADE
- FK: `created_by` / `updated_by` → `auth.users(id)` ON DELETE RESTRICT

**Constraints**
- UNIQUE index: `(warehouse_id, lower(name))`（同倉庫名稱大小寫無感不可重複）

**Indexes**
- `storage_locations_warehouse_name_unique`
- `storage_locations_org_id_idx`
- `storage_locations_warehouse_id_idx`

**Row Ownership / Tenant Keys**
- row belongs to `org_id` and `warehouse_id`

**Audit / History**
- 允許直接改名（dictionary data），MVP 不提供 delete（後續以 archived 設計擴充）

### 4.6 `tags`

**Purpose**
- 標籤字典（UC_04），可貼附到批次，用於分類與搜尋。

**Columns（表格）**
- `id` | uuid | not null | gen_random_uuid() | PK | -
- `org_id` | uuid | not null | - | FK to orgs | -
- `warehouse_id` | uuid | not null | - | FK to warehouses | -
- `name` | text | not null | - | 標籤名稱 | 緊急用品
- `created_by` | uuid | not null | - | 建立者 | auth.users.id
- `updated_by` | uuid | not null | - | 最後更新者 | auth.users.id
- `created_at` | timestamptz | not null | now() | 建立時間 | -
- `updated_at` | timestamptz | not null | now() | 更新時間 | -

**Primary Key / Foreign Keys**
- PK: `id`
- FK: `org_id` → `orgs(id)` ON DELETE CASCADE
- FK: `warehouse_id` → `warehouses(id)` ON DELETE CASCADE
- FK: `created_by` / `updated_by` → `auth.users(id)` ON DELETE RESTRICT

**Constraints**
- UNIQUE index: `(warehouse_id, lower(name))`（同倉庫名稱大小寫無感不可重複）

**Indexes**
- `tags_warehouse_name_unique`（unique）
- `tags_org_id_idx`
- `tags_warehouse_id_idx`

**Row Ownership / Tenant Keys**
- row belongs to `org_id` and `warehouse_id`

**Audit / History**
- 允許直接改名（dictionary data），MVP 不提供 delete

---

### 4.7 `batches`

**Purpose**
- 庫存批次（UC_05）。每次入庫建立或更新一筆批次，記錄物品的「一批」庫存（數量、到期日、存放點、標籤）。

**Columns（表格）**
- `id` | uuid | not null | gen_random_uuid() | PK | -
- `org_id` | uuid | not null | - | FK to orgs | -
- `warehouse_id` | uuid | not null | - | FK to warehouses | -
- `item_id` | uuid | not null | - | FK to items（ON DELETE RESTRICT） | -
- `quantity` | numeric | not null | 0 | 現有庫存（≥ 0）；UC_06 由 integer 改為 numeric | 10
- `expiry_date` | date | null | - | 到期日 | 2028-06-30
- `storage_location_id` | uuid | null | - | FK to storage_locations（ON DELETE SET NULL） | -
- `tag_id` | uuid | null | - | FK to tags（ON DELETE SET NULL） | -
- `created_by` | uuid | not null | - | 建立者 | auth.users.id
- `created_at` | timestamptz | not null | now() | 建立時間 | -
- `updated_at` | timestamptz | not null | now() | 最後更新時間 | -

**Primary Key / Foreign Keys**
- PK: `id`
- FK: `org_id` → `orgs(id)` ON DELETE CASCADE
- FK: `warehouse_id` → `warehouses(id)` ON DELETE CASCADE
- FK: `item_id` → `items(id)` ON DELETE RESTRICT
- FK: `storage_location_id` → `storage_locations(id)` ON DELETE SET NULL
- FK: `tag_id` → `tags(id)` ON DELETE SET NULL
- FK: `created_by` → `auth.users(id)` ON DELETE RESTRICT

**Constraints**
- CHECK(`quantity >= 0`)

**Indexes**
- `batches_org_id_idx`
- `batches_item_id_idx`
- `batches_warehouse_id_idx`

**Row Ownership / Tenant Keys**
- row belongs to `org_id` and `warehouse_id`

**Audit / History**
- `created_by`, `created_at`, `updated_at`（trigger 自動更新）
- 不可刪除（RLS 無 DELETE policy）；quantity 以交易修正

---

### 4.8 `transactions`

**Purpose**
- 交易紀錄（append-only，UC_05～07）。每次入庫/消耗/調整都在此表寫一筆，永不刪除。

**Columns（表格）**
- `id` | uuid | not null | gen_random_uuid() | PK | -
- `org_id` | uuid | not null | - | FK to orgs | -
- `warehouse_id` | uuid | not null | - | FK to warehouses | -
- `batch_id` | uuid | not null | - | FK to batches（ON DELETE RESTRICT） | -
- `item_id` | uuid | not null | - | FK to items（ON DELETE RESTRICT，非規範化備援） | -
- `type` | text | not null | - | 交易類型：`'inbound'`、`'consumption'`、`'adjustment'` | inbound
- `quantity_delta` | numeric | not null | - | 數量變化量（入庫正、消耗負、調整正負均可） | -2.5
- `quantity_after` | numeric | null | - | 調整後快照（UC_07；inbound/consumption 為 null） | 8
- `idempotency_key` | text | null | - | 冪等鍵（org 內唯一，null 表示不保護） | uuid
- `note` | text | null | - | 操作備註 | 盤點修正
- `source` | text | null | 'web' | 來源（'web' / 'api' / 'import'） | web
- `created_by` | uuid | not null | - | 建立者 | auth.users.id
- `created_at` | timestamptz | not null | now() | 建立時間 | -

**Primary Key / Foreign Keys**
- PK: `id`
- FK: `org_id` → `orgs(id)` ON DELETE CASCADE
- FK: `warehouse_id` → `warehouses(id)` ON DELETE CASCADE
- FK: `batch_id` → `batches(id)` ON DELETE RESTRICT
- FK: `item_id` → `items(id)` ON DELETE RESTRICT
- FK: `created_by` → `auth.users(id)` ON DELETE RESTRICT

**Constraints**
- CHECK(`type IN ('inbound','consumption','adjustment')`)（migration 20260229000001）
- UNIQUE partial index: `(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL`

**Indexes**
- `transactions_org_id_idx`
- `transactions_batch_id_idx`
- `transactions_item_id_idx`
- `transactions_created_at_idx`
- `transactions_batch_id_created_at_idx`（複合，UC_07 新增，用於批次交易歷史查詢）

**Row Ownership / Tenant Keys**
- row belongs to `org_id` and `warehouse_id`

**Audit / History**
- Append-only：RLS 無 UPDATE/DELETE policy；錯誤以後續交易沖銷

---

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
- UC_03：`supabase/migrations/20260224000000_uc03_storage_locations.sql` 新增 `storage_locations`、大小寫無感 unique index、`updated_at` trigger 與 RLS（owner/editor 可寫、member 可讀）。
- UC_03 PR#1 review fix：`supabase/migrations/20260224010000_uc03_storage_locations_updated_by.sql` 補上 `updated_by` 欄位，並強化 insert/update policy（要求 `updated_by = auth.uid()`）。
- UC_04：`supabase/migrations/20260225000000_uc04_tags.sql` 新增 `tags` 表、RLS（owner/editor 可寫、member 可讀）、unique index `(warehouse_id, lower(name))`。
- UC_04 security fix：`supabase/migrations/20260225000001_uc04_tags_security_fixes.sql` 修正 RLS policy。
- UC_05：`supabase/migrations/20260226000000_uc05_batches_transactions.sql` 新增 `batches`、`transactions`，RLS SELECT only（寫入僅透過 RPC）；建立 `create_inbound_batch`、`add_inbound_to_batch` security definer RPC（含原子性寫入與 idempotency 保護）。
- UC_05 security fix：`supabase/migrations/20260226000001_uc05_fix_inbound_rpc_security.sql` 修正 inbound RPC：驗證 storage_location_id/tag_id 歸屬同 org（SECURITY DEFINER bypass RLS 風險）；idempotency 改為 race-safe BEGIN…EXCEPTION handler。
- UC_06 型別升級：`supabase/migrations/20260227000000_uc06_numeric_quantity.sql` 將 `batches.quantity` 與 `transactions.quantity_delta` 由 `integer` 改為 `numeric`；重建 inbound RPC（因 return type 改變須 DROP + CREATE）。
- UC_06 consume RPC：`supabase/migrations/20260227000001_uc06_consume_rpc.sql` 新增 `consume_from_batch` security definer RPC（SELECT FOR UPDATE 防競態、INSUFFICIENT_STOCK 檢查、idempotency via unique_violation handler）。
- UC_07：`supabase/migrations/20260228000000_uc07_adjustment.sql` 在 `transactions` 新增 `quantity_after numeric null` 欄位（adjustment 事件的調整後數量，供重播校正用；其他類型交易為 null）；新增 `transactions(batch_id, created_at)` 複合索引；建立 `adjust_batch_quantity` security definer RPC（SELECT FOR UPDATE 防競態、idempotency via unique_violation handler）。
- UC_07 fix：`supabase/migrations/20260228000001_uc07_adjustment_fix.sql` 修正 idempotency conflict path 回傳 `t.batch_id`（而非 caller 傳入的 `p_batch_id`）；conflict not found 改為 raise `'CONFLICT'`。
- UC_06 fix：`supabase/migrations/20260229000000_uc06_consume_rpc_conflict_fix.sql` 修正 `consume_from_batch` idempotency fault path 由 `'FORBIDDEN'` 改為 `'CONFLICT'`（與 adjust_batch_quantity 一致）；同步補入 `v_existing_batch_id` 欄位。
- DB 防禦性改進：`supabase/migrations/20260229000001_transactions_type_check.sql` 在 `transactions.type` 加 CHECK constraint，強制只允許合法交易類型。

## 9. Seed / Fixtures（測試資料）

- 最小 seed 內容（哪些表必填）
- 測試用 fixture 生成策略（兩 org、兩 user 等）
- UC_01：integration tests 以 admin client 建立 user，呼叫 bootstrap RPC 建立 org/warehouse/membership
- UC_01 PR#4：新增兩帳號/兩 org fixture，驗證 RLS 阻擋跨租戶 select/insert/update（AC3）。

## 10. 附錄

- Glossary（名詞）
- 相關連結（Supabase schema、ERD 圖、SQL 檔案）
