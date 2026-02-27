# UC-04 Current State: Tags & Categories

- Source spec: `docs/features/archived/uc_04_feature_tags_categories.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Product Behavior (Current)
- 可維護倉庫層級標籤字典：新增、改名、列表。
- 標籤可被 Items（預設標籤 `default_tag_id`）與入庫批次（`tag_id`）引用。
- 標籤採 ID 關聯；改名後既有 Items/批次/交易顯示會同步更新。
- 同倉庫內標籤名稱需唯一。
- **MVP 每個 item/batch 僅能關聯 1 個 tag**（`default_tag_id`/`tag_id` 為單值 FK）。多標籤為 Future Works。

## 2. API / Actions (Current)
- `action createTag(input)`
  - Request: `{ name }`
  - Errors: `TAG_NAME_REQUIRED`, `TAG_NAME_CONFLICT`, `FORBIDDEN`
- `action renameTag(tagId, name)`
  - Request: `{ name }`
  - Errors: `NOT_FOUND`, `TAG_NAME_CONFLICT`, `FORBIDDEN`
- `action listTags()`
  - Response: `Tag[]`

## 3. Permissions / Security
- owner/editor: 可新增、改名。
- viewer: 僅可讀。
- tag 資料需綁 org/warehouse 並受 RLS 限制。

## 4. Known Limits
- MVP 不含標籤作廢/禁用。
- 不含進階篩選 UI（例如依 tag 篩 stock view）。
