# UC-02 Current State: Items

- Source spec: `docs/features/archived/uc_02_items.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Product Behavior (Current)
- 可新增、編輯、查詢品項主檔（Items）。
- 主要欄位：`name`, `unit`（必要）；`defaultTagId?`（可選，單一標籤）。
- `name` 與 `unit` 為必要欄位；同 org 內品項名稱需唯一。
- Items 屬管理資料，允許直接編輯（非交易 append-only）。

## 2. API / Actions (Current)
- `action createItem(input)`
  - Request: `{ name, unit, defaultTagId? }`
  - Errors: `ITEM_NAME_REQUIRED`, `ITEM_UNIT_REQUIRED`, `ITEM_NAME_CONFLICT`, `FORBIDDEN`
- `action updateItem(itemId, patch)`
  - Request: `{ name?, unit?, defaultTagId?, isDeleted? }`
  - Errors: `ITEM_NOT_FOUND`, `ITEM_NAME_CONFLICT`, `FORBIDDEN`
- `action listItems(query?)`
  - Request: `{ q? }`
  - Response: `Item[]`

## 3. Permissions / Security
- owner/editor: 可新增與編輯。
- viewer: 僅可讀。
- 資料必須綁定 org 並受 RLS 保護。

## 4. Known Limits
- `minStock`、`note` 欄位存在於資料層（schema 有欄位），但 MVP UI 未暴露編輯；`createItem` 固定以 `minStock=0` 建立。若需維護這些欄位，需直接操作 DB 或待後續功能開放。
- MVP 每個 item 僅能關聯 1 個預設 tag（`default_tag_id` 單值 FK）。多標籤為 Future Works。
- 刪除策略以避免破壞歷史引用為主（soft-delete，`isDeleted` flag）。
