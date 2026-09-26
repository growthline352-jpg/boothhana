-- Apply manually AFTER database/001 and 002, BEFORE deploying the patched API.
-- This migration does NOT recalculate existing stock or restore any POS inventory.
-- Make a database backup first. Existing bad rows are reported by the audit below;
-- CHECK constraints are NOT VALID so no existing row is silently rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE event_product ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'event_product'::regclass AND conname = 'ck_event_product_stock') THEN
    ALTER TABLE event_product ADD CONSTRAINT ck_event_product_stock CHECK (
      (stock_mode = 'FINITE' AND stock_quantity IS NOT NULL AND stock_quantity >= 0)
      OR (stock_mode = 'INFINITE' AND stock_quantity IS NULL)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'event_product'::regclass AND conname = 'ck_event_product_price') THEN
    ALTER TABLE event_product ADD CONSTRAINT ck_event_product_price CHECK (price >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'reservation_item'::regclass AND conname = 'ck_reservation_item_amounts') THEN
    ALTER TABLE reservation_item ADD CONSTRAINT ck_reservation_item_amounts CHECK (quantity > 0 AND unit_price >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'pos_sale_item'::regclass AND conname = 'ck_pos_sale_item_amounts') THEN
    ALTER TABLE pos_sale_item ADD CONSTRAINT ck_pos_sale_item_amounts CHECK (quantity > 0 AND unit_price >= 0) NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_event_booth_status_public ON event_booth(event_id, status, is_public);
CREATE INDEX IF NOT EXISTS idx_product_booth ON product(booth_id);
CREATE INDEX IF NOT EXISTS idx_reservation_item_reservation ON reservation_item(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_item_product ON reservation_item(event_product_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_booth_time ON pos_sale(event_booth_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sale_item_sale ON pos_sale_item(pos_sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_item_product ON pos_sale_item(event_product_id);
COMMIT;

-- Read-only audit. Do not guess replacement quantities from historical sales.
SELECT id, stock_mode, stock_quantity, price FROM event_product
WHERE price < 0 OR stock_mode NOT IN ('FINITE', 'INFINITE')
   OR (stock_mode = 'FINITE' AND (stock_quantity IS NULL OR stock_quantity < 0))
   OR (stock_mode = 'INFINITE' AND stock_quantity IS NOT NULL);
-- After auditing/correcting existing data, an administrator may separately run:
-- ALTER TABLE event_product VALIDATE CONSTRAINT ck_event_product_stock;
-- ALTER TABLE event_product VALIDATE CONSTRAINT ck_event_product_price;
-- ALTER TABLE reservation_item VALIDATE CONSTRAINT ck_reservation_item_amounts;
-- ALTER TABLE pos_sale_item VALIDATE CONSTRAINT ck_pos_sale_item_amounts;
