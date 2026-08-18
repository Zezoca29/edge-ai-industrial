-- V004 - Retail domain: stores, products and shelf slots
-- Turns the generic industrial monitor into a shelf-stockout platform.

CREATE TABLE IF NOT EXISTS stores (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    cnpj       VARCHAR(18),
    address    TEXT,
    timezone   TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users   ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);

CREATE TABLE IF NOT EXISTS products (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id         UUID NOT NULL REFERENCES stores(id),
    name             TEXT NOT NULL,
    sku              TEXT,
    unit_weight_g    NUMERIC(10,2) NOT NULL CHECK (unit_weight_g > 0),
    tolerance_g      NUMERIC(10,2) NOT NULL DEFAULT 5,
    unit_price_cents INT,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_id, sku)
);

CREATE TABLE IF NOT EXISTS shelf_slots (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id        UUID NOT NULL REFERENCES devices(id),
    slot_index       SMALLINT NOT NULL DEFAULT 0,
    product_id       UUID REFERENCES products(id),
    tare_g           NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_qty          INT NOT NULL DEFAULT 3,
    current_qty      INT,
    current_weight_g NUMERIC(10,2),
    suspect          BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (device_id, slot_index)
);

ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS store_id   UUID REFERENCES stores(id);

CREATE INDEX IF NOT EXISTS idx_products_store    ON products (store_id, active);
CREATE INDEX IF NOT EXISTS idx_shelf_slots_device ON shelf_slots (device_id, slot_index);
CREATE INDEX IF NOT EXISTS idx_pick_events_store ON pick_events (store_id, time DESC);
