-- V007 - Produtos levantados na visita ao comerciante (P0).
--
-- Substitui os quatro produtos de exemplo do V005 pelos que o dono apontou
-- como os que mais somem da gondola sem aviso. Pesos e precos vieram da
-- visita; a tara nao foi medida e fica em zero ate a instalacao da bancada.
--
-- Origem dos dados: entrevista simulada em 2026-08-18. Substituir por uma
-- visita real antes de usar como evidencia de validacao no relatorio.

-- Aposenta os produtos de exemplo.
UPDATE products
SET active = FALSE
WHERE store_id = '11111111-1111-1111-1111-111111111111'
  AND sku IN ('ARZ-1KG', 'FJO-1KG', 'LTE-1L', 'CAF-500');

-- Nenhum slot pode continuar apontando para um produto aposentado: a contagem
-- que ele carrega e do produto antigo e nao significa mais nada.
UPDATE shelf_slots
SET product_id = NULL,
    current_qty = NULL,
    suspect = FALSE
WHERE product_id IN (
    SELECT id FROM products
    WHERE store_id = '11111111-1111-1111-1111-111111111111'
      AND sku IN ('ARZ-1KG', 'FJO-1KG', 'LTE-1L', 'CAF-500')
);

INSERT INTO products (store_id, name, sku, unit_weight_g, tolerance_g, unit_price_cents)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Arroz 5 kg',  'ARZ001', 5000, 75,  2990),
    ('11111111-1111-1111-1111-111111111111', 'Feijao 1 kg', 'FEI001', 1000, 15,  799),
    ('11111111-1111-1111-1111-111111111111', 'Acucar 5 kg', 'ACU001', 5000, 75,  1990),
    ('11111111-1111-1111-1111-111111111111', 'Cafe 500 g',  'CAF001', 500,  7.5, 1890)
ON CONFLICT (store_id, sku) DO NOTHING;

-- Estoque minimo combinado na loja, por produto. O vinculo produto->prateleira
-- e a tara sao feitos na tela de configuracao depois que a bancada estiver
-- instalada, porque so ali se sabe qual ESP32 ficou embaixo de qual gondola.
--
--   Arroz 5 kg   repor com 5 unidades   falta ~2x/semana
--   Feijao 1 kg  repor com 6 unidades   falta ~2x/semana
--   Acucar 5 kg  repor com 4 unidades   falta ~1x/semana
--   Cafe 500 g   repor com 5 unidades   falta ~2x/semana
--
-- Prateleira alvo: 90 cm de largura por 40 cm de profundidade.
-- Wi-Fi disponivel na loja. Tomada proxima, mas sem passagem de fio pelo
-- corredor - ver restricoes de instalacao no P2.
