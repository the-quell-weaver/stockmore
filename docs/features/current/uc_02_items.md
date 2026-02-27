# UC-02 Current State: Items

- Source spec: `docs/features/archived/uc_02_items.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Product Behavior (Current)
- 可新增、編輯、查詢品項主檔（Items）。
- 主要欄位：`name`, `unit`, `minStock`, `defaultTagIds?`, `note?`。
- `minStock` 允許 `0`；`name` 與 `unit` 為必要欄位。
- 同 org 內品項名稱需唯一。
- Items 屬管理資料，允許直接編輯（非交易 append-only）。

## 2. API / Actions (Current)
- `action createItem(input)`
  - Request: `{ name, unit, minStock, defaultTagIds?, note? }`
  - Errors: `ITEM_NAME_REQUIRED`, `ITEM_UNIT_REQUIRED`, `ITEM_MIN_STOCK_INVALID`, `ITEM_NAME_CONFLICT`, `FORBIDDEN`
- `action updateItem(itemId, patch)`
  - Request: `{ name?, unit?, minStock?, defaultTagIds?, note? }`
  - Errors: `ITEM_NOT_FOUND`, `ITEM_NAME_CONFLICT`, `FORBIDDEN`
- `action listItems(query?)`
  - Request: `{ q? }`
  - Response: `{ items: Item[] }`

## 3. Permissions / Security
- owner/editor: 可新增與編輯。
- viewer: 僅可讀。
- 資料必須綁定 org 並受 RLS 保護。

## 4. Known Limits
- 標籤在 API/資料層保留擴充路徑，但 MVP UI 可能未完全暴露選擇器。
- 刪除策略以避免破壞歷史引用為主（建議禁止硬刪除或採 soft-delete）。
