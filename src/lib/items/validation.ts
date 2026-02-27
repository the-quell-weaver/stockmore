import { ItemError, ITEM_ERROR_CODES } from "@/lib/items/errors";

export type CreateItemInput = {
  name: string;
  unit: string;
  minStock: number;
  defaultTagIds?: string[] | null;
  note?: string | null;
};

export type UpdateItemInput = {
  name?: string;
  unit?: string;
  minStock?: number;
  defaultTagIds?: string[] | null;
  note?: string | null;
  isDeleted?: boolean;
  targetQuantity?: number | null;  // UC-11
};

export type ListItemsInput = {
  q?: string;
  includeDeleted?: boolean;
};

export function validateCreateItemInput(input: CreateItemInput): CreateItemInput {
  return {
    name: validateName(input.name),
    unit: validateUnit(input.unit),
    minStock: validateMinStock(input.minStock),
    defaultTagIds: normalizeOptionalIds(input.defaultTagIds),
    note: normalizeOptionalText(input.note),
  };
}

export function validateUpdateItemInput(input: UpdateItemInput): UpdateItemInput {
  const patch: UpdateItemInput = {};

  if (input.name !== undefined) {
    patch.name = validateName(input.name);
  }
  if (input.unit !== undefined) {
    patch.unit = validateUnit(input.unit);
  }
  if (input.minStock !== undefined) {
    patch.minStock = validateMinStock(input.minStock);
  }
  if (input.defaultTagIds !== undefined) {
    patch.defaultTagIds = normalizeOptionalIds(input.defaultTagIds);
  }
  if (input.note !== undefined) {
    patch.note = normalizeOptionalText(input.note);
  }
  if (input.isDeleted !== undefined) {
    patch.isDeleted = input.isDeleted;
  }
  if (input.targetQuantity !== undefined) {
    patch.targetQuantity = validateTargetQuantity(input.targetQuantity);
  }

  return patch;
}

export function normalizeListQuery(input?: ListItemsInput): ListItemsInput {
  const q = input?.q?.trim() ?? "";
  return {
    q: q.length > 0 ? q : undefined,
    includeDeleted: input?.includeDeleted ?? false,
  };
}

function validateName(raw: string): string {
  const name = raw.trim();
  if (!name) {
    throw new ItemError(ITEM_ERROR_CODES.ITEM_NAME_REQUIRED);
  }
  return name;
}

function validateUnit(raw: string): string {
  const unit = raw.trim();
  if (!unit) {
    throw new ItemError(ITEM_ERROR_CODES.ITEM_UNIT_REQUIRED);
  }
  return unit;
}

function validateMinStock(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) {
    throw new ItemError(ITEM_ERROR_CODES.ITEM_MIN_STOCK_INVALID);
  }
  return raw;
}

function normalizeOptionalText(raw?: string | null): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

export function validateTargetQuantity(raw: number | null): number | null {
  if (raw === null) return null;
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new ItemError(ITEM_ERROR_CODES.TARGET_QUANTITY_INVALID);
  }
  return raw;
}

function normalizeOptionalIds(raw?: string[] | null): string[] | null {
  if (raw == null) return null;
  const normalized = raw
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return normalized.length > 0 ? normalized : null;
}
