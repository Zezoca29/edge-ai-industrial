-- V005 - Demo store, admin binding and starter products.
-- Replace the product rows with the real ones collected in P0 (merchant interview).

INSERT INTO stores (id, name, cnpj, address)
VALUES ('11111111-1111-1111-1111-111111111111', 'Mercadinho Demo', NULL, 'Rua Exemplo, 100')
ON CONFLICT (id) DO NOTHING;

UPDATE users
SET store_id = '11111111-1111-1111-1111-111111111111'
WHERE store_id IS NULL;

UPDATE devices
SET store_id = '11111111-1111-1111-1111-111111111111'
WHERE store_id IS NULL;

-- Ensure every existing device has at least one shelf slot so the dashboard's
-- shelf table is never empty (controller ruling, task-2-brief addendum).
INSERT INTO shelf_slots (device_id, slot_index)
SELECT d.id, 0
FROM devices d
WHERE NOT EXISTS (
    SELECT 1 FROM shelf_slots s WHERE s.device_id = d.id AND s.slot_index = 0
);

INSERT INTO products (store_id, name, sku, unit_weight_g, tolerance_g, unit_price_cents)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Arroz 1kg',        'ARZ-1KG', 1000.00, 15.00, 650),
    ('11111111-1111-1111-1111-111111111111', 'Feijao 1kg',       'FJO-1KG', 1000.00, 15.00, 890),
    ('11111111-1111-1111-1111-111111111111', 'Leite Caixa 1L',   'LTE-1L',  1030.00, 15.00, 550),
    ('11111111-1111-1111-1111-111111111111', 'Cafe 500g',        'CAF-500', 500.00,  10.00, 1790)
ON CONFLICT (store_id, sku) DO NOTHING;
