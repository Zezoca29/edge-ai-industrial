-- V008 - Alerts get a store, a slot and a resolution; push subscriptions arrive.
--
-- The alerts table has existed since PJI510 and never received a row. It is
-- now the record of two rules: a shelf that crossed below its minimum, and a
-- device that stopped reporting.

-- NOT NULL é seguro: a tabela nunca recebeu uma linha desde o PJI510.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS store_id      UUID NOT NULL REFERENCES stores(id);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS shelf_slot_id UUID REFERENCES shelf_slots(id);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at   TIMESTAMPTZ;

-- Duplicate alerts are impossible, not improbable: a second open alert of the
-- same type for the same shelf is refused by the database. Two indexes because
-- the two rules key differently - stock is per shelf, silence is per device.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_open_slot
    ON alerts (shelf_slot_id, alert_type)
    WHERE resolved_at IS NULL AND shelf_slot_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_open_device
    ON alerts (device_id, alert_type)
    WHERE resolved_at IS NULL AND shelf_slot_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_store_open
    ON alerts (store_id, resolved_at, acknowledged, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    store_id        UUID NOT NULL REFERENCES stores(id),
    endpoint        TEXT NOT NULL UNIQUE,
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,
    failure_count   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_success_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_store ON push_subscriptions (store_id);
