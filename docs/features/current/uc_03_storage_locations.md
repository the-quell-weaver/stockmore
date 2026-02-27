# UC-03 Current State: Storage Locations

- Source spec: `docs/features/archived/uc_03_storage_locations.md`
- Status: Implemented
- Last synced: 2026-02-27

## 1. Product Behavior (Current)
- 可維護倉庫層級存放點字典：新增、改名、列表。
- 存放點採 ID 關聯；改名後既有批次顯示會同步更新。
- 批次可不指定存放點（nullable）。
- 同倉庫內存放點名稱需唯一。

## 2. API / Actions (Current)
- `action createStorageLocation(input)`
  - Request: `{ name }`
  - Errors: `LOCATION_NAME_REQUIRED`, `LOCATION_NAME_CONFLICT`, `FORBIDDEN`
- `action renameStorageLocation(locationId, name)`
  - Request: `{ name }`
  - Errors: `NOT_FOUND`, `LOCATION_NAME_CONFLICT`, `FORBIDDEN`
- `action listStorageLocations()`
  - Response: `{ locations: StorageLocation[] }`

## 3. Permissions / Security
- owner/editor: 可新增、改名。
- viewer: 僅可讀。
- location 資料需綁 org/warehouse 並受 RLS 限制。

## 4. Known Limits
- MVP 不提供作廢/禁用流程。
- 存放點轉移交易（改批次 location）屬後續功能。
