-- V009 - Minimo de reposicao por produto.
--
-- O V007 registrou, num comentario, o minimo combinado com o comerciante para
-- cada produto ("Arroz 5 kg  repor com 5 unidades"). Mas nao havia onde
-- grava-lo: min_qty vive em shelf_slots, e no momento do seed nenhum slot
-- existe ainda, porque so se sabe qual ESP32 ficou embaixo de qual gondola
-- depois da instalacao. O numero ficava perdido dentro do SQL, e todo slot
-- nascia no DEFAULT 3 do V004 ate alguem digitar o valor certo na tela.
--
-- O minimo e propriedade do PRODUTO, nao da prateleira: mudar o arroz de
-- gondola nao muda com quantas unidades ele precisa ser reposto. Passa a viver
-- aqui, e o slot o adota no momento do vinculo.

ALTER TABLE products ADD COLUMN IF NOT EXISTS default_min_qty INT;

COMMENT ON COLUMN products.default_min_qty IS
    'Minimo de reposicao combinado na loja. O slot adota este valor ao vincular o produto, quando nenhum minimo e enviado junto. NULL = sem numero combinado.';

-- Numeros da visita ao comerciante (P0) - os mesmos que ate agora estavam so
-- no comentario do V007. Continuam sujeitos a confirmacao numa visita real.
UPDATE products SET default_min_qty = 5
WHERE store_id = '11111111-1111-1111-1111-111111111111' AND sku = 'ARZ001';

UPDATE products SET default_min_qty = 6
WHERE store_id = '11111111-1111-1111-1111-111111111111' AND sku = 'FEI001';

UPDATE products SET default_min_qty = 4
WHERE store_id = '11111111-1111-1111-1111-111111111111' AND sku = 'ACU001';

UPDATE products SET default_min_qty = 5
WHERE store_id = '11111111-1111-1111-1111-111111111111' AND sku = 'CAF001';
