-- V006 - Backfill store_id on pick events recorded before the retail domain existed.
--
-- V004 added pick_events.store_id and V005 bound users and devices to the demo
-- store, but nothing ever filled it in for the pick rows themselves. Once the
-- pick queries became store-scoped, every event from before that change fell
-- out of /api/picks with no trace. The device already knows its store, so the
-- value is recoverable rather than lost.

UPDATE pick_events pe
SET store_id = d.store_id
FROM devices d
WHERE pe.device_id = d.id
  AND pe.store_id IS NULL
  AND d.store_id IS NOT NULL;
