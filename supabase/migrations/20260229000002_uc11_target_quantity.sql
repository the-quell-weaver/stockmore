-- Add target_quantity to items for UC-11 purchase planning mode.
-- NULL = item not on purchase plan. Must be > 0 when set (enforced at app layer).
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS target_quantity numeric;

COMMENT ON COLUMN items.target_quantity IS
  'UC-11: target stock quantity for purchase planning. NULL = not on plan.';
