# PJI610 — Plataforma de Ruptura de Gôndola — Design Spec

**Data:** 2026-08-18
**Projeto:** Edge AI Industrial — UNIVESP PJI610 (Projeto Integrador VI)
**Escopo:** Evoluir o sistema entregue no PJI510 (monitoramento industrial genérico com Edge AI) para uma plataforma de controle de ruptura de gôndola em pequeno comércio, atendendo aos requisitos adicionais do PJI610: desenvolvimento móvel, interface com o usuário, acessibilidade, escalabilidade e plano de negócios.

---

## Contexto

O PJI510 entregou um sistema funcional: ESP32 → MQTT/EMQX → Spring Boot → Kafka → TimescaleDB → dashboard Next.js, com detecção de retirada por peso. O PJI610 exige, além disso:

- resolver um **problema local real**;
- plataforma **escalável**;
- **desenvolvimento web e para dispositivos móveis**;
- **interface com o usuário e acessibilidade**;
- **plano de negócios**.

**Problema local real escolhido:** ruptura de gôndola em pequeno comércio de bairro (mercadinho, farmácia, padaria). O produto acaba na prateleira, o dono não percebe, e a venda é perdida para o concorrente da esquina. É um problema com comprador pagante identificável e mensurável em reais.

**Restrições do semestre:** desenvolvedor solo, ~4 meses, 5–10h/semana. Orçamento de ~110h, das quais ~25h vão para redação do TCC e apresentação. Restam **~95h de construção**.

---

## Decomposição em sub-projetos

Cada sub-projeto recebe sua própria spec, plano e ciclo de implementação.

| # | Sub-projeto | Horas | Depende de |
|---|---|---|---|
| P0 | Descoberta com comerciante real | 4h | — |
| P1 | Núcleo de domínio de varejo | 12h | P0 |
| P2 | Bancada física + Edge AI real | 36h | — (paralelo) |
| P3 | Alertas + PWA | 13h | P1 |
| P4 | Acessibilidade e UX | 15h | P3 |
| P5 | Plano de negócios | 15h | P0, P2 |
| | **Total** | **95h** | |

**Ordem.** P0 na semana 1 — a entrevista informa o modelo de dados do P1, e fazê-la depois gera retrabalho. Compra do hardware também na semana 1, por causa do frete. P2 roda em paralelo ao P1. P4 vem depois do P3 de propósito: acessibilidade aplicada antes das telas existirem é trabalho feito duas vezes.

**Fora de escopo, explicitamente (YAGNI):** billing/Stripe, Kubernetes, OTA de firmware, RBAC completo, app React Native nativo, superadmin global. Reavaliar apenas se sobrar tempo em dezembro; nenhum deles é requisito.

---

## Decisões de arquitetura

### D1 — A arquitetura atual é congelada

Kafka, EMQX, TimescaleDB e Spring Boot permanecem como estão. Já funcionam e já constituem a evidência de escalabilidade exigida pela ementa. Nenhuma hora do semestre vai para reescrevê-los.

**Risco aceito:** cinco contêineres rodando num notebook no dia da apresentação. Mitigação no P3: modo de demonstração com dados semeados, que não depende de broker nem de rede.

### D2 — A quantidade em prateleira é derivada do peso absoluto

`qty = round((peso_g − tare_g) / unit_weight_g)`

Alternativa descartada: manter um contador incrementado/decrementado pelos deltas enviados pelo firmware.

**Por quê:** o peso absoluto é auto-corretivo. Uma leitura perdida ou um delta errado não desalinham o estoque permanentemente — a próxima leitura boa corrige sozinha. Além disso, reposição de produto é detectada de graça (peso subiu), sem nenhum código adicional.

**Custo aceito:** cria dependência de `unit_weight_g` estar cadastrado e correto. Por isso a tela de cadastro de produto pertence ao P1, e não ao P3.

### D3 — O firmware para de decidir regra de negócio

Hoje o ESP32 decide `product_name`, `quantity` e `confidence`, e o backend grava esses valores crus. Isso significa que trocar o produto de uma prateleira exige recompilar e regravar o dispositivo — inviável para o dono de um mercadinho.

O firmware passa a publicar **apenas fato físico**: peso absoluto em gramas e um booleano de estabilidade. A identidade do produto e a contagem de unidades passam a ser resolvidas no backend, onde a informação já existe e é editável por tela.

**Escopo preciso da mudança no payload (v2).** Sai o bloco `pick_event`; `sensors.weight` passa a ser absoluto em gramas; entra `weight_stable`. Os campos `temperature`, `vibration` e `current` **permanecem no payload durante o P1**, para não quebrar `SensorService`, a hypertable `sensor_data` nem o gráfico de três séries já entregue. Vibração e corrente são descartadas apenas como **entradas do modelo** no P2 — o que é uma decisão de ML, não de protocolo.

**`slot_index` no payload.** O P1 assume um slot por dispositivo. O payload não carrega `slot_index`; o backend assume `0` na resolução do slot. O campo existe no schema para que o suporte a múltiplas células por ESP32 não exija migration futura, mas nenhum código do P1 escreve valor diferente de zero.

**Consequência aceita:** o Wokwi e o simulador Python de hoje quebram e precisam ser atualizados no P1 (~2h). Optou-se por isso em vez de manter dois caminhos de código convivendo — duas fontes de verdade para o mesmo fato é onde nascem bugs de demonstração.

### D4 — A Edge AI passa a ser essencial, não decorativa

**Estado real encontrado no código:**

- `firmware/lib/inference/inference_engine.cpp:34` — todo o caminho TFLite está sob `#ifdef USE_TFLITE`, e `USE_TFLITE` não é definido em `firmware/platformio.ini`; a lib `EloquentTinyML` também não consta em `lib_deps`. O bloco nunca compila.
- O firmware real executa o fallback `score = vibration / 2.0f`.
- `wokwi/sketch.ino:85` usa uma fórmula heurística escrita à mão, sem modelo.
- `model.tflite` e `model_data.cpp` (2.444 bytes) existem e o pipeline `train_model.py` é real e testado — o modelo é treinado e exportado, mas nunca carregado no dispositivo.

Ou seja: a última milha da Edge AI ficou aberta no PJI510.

**Decisão:** retreinar o modelo TFLite Micro para classificar **assinatura de peso** — distinguir retirada real de encostão, de reposição e de queda de produto — e fechar o loop de execução (`lib_deps`, `USE_TFLITE`, validação em dispositivo e no Wokwi).

Com isso a inferência na borda vira o filtro anti-ruído do sistema: o ESP32 decide localmente se o evento merece ir para a rede. A Edge AI passa a ser o motivo pelo qual o sistema funciona, em vez de um enfeite no título.

A entrada de temperatura é mantida com uso honesto: prateleira refrigerada e perecível fora de faixa. Vibração e corrente são descartadas — não têm significado numa gôndola.

### D5 — Mobile via PWA, não app nativo

O dashboard Next.js existente vira Progressive Web App: instalável, service worker, Web Push de ruptura. Reaproveita 100% do código e fecha o módulo `alerts/`, hoje vazio. React Native seria uma quarta base de código para manter junto de firmware, backend e web — inviável no orçamento.

### D6 — Todo usuário pertence a exatamente uma loja

Não existe superadmin global. O seed vincula `admin@edgeai.local` a uma loja demo. Papel global seria uma tela de administração que ninguém usaria no TCC.

---

## P1 — Núcleo de domínio de varejo (detalhado)

Este é o sub-projeto que amarra todos os outros e o primeiro a ser implementado.

### Modelo de dados — migration `V004__retail_domain.sql`

**`stores`** (nova) — raiz do multi-loja.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT NOT NULL | |
| `cnpj` | VARCHAR(18) | opcional |
| `address` | TEXT | |
| `timezone` | TEXT | default `America/Sao_Paulo` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**`users`** e **`devices`** ganham `store_id UUID REFERENCES stores(id)`.

**`products`** (nova) — escopada por loja.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | UUID PK | |
| `store_id` | UUID NOT NULL FK | |
| `name` | TEXT NOT NULL | |
| `sku` | TEXT | único por loja |
| `unit_weight_g` | NUMERIC(10,2) NOT NULL | `CHECK (unit_weight_g > 0)` |
| `tolerance_g` | NUMERIC(10,2) | default 5; margem aceita entre o peso lido e o múltiplo inteiro esperado antes de marcar o slot como suspeito |
| `unit_price_cents` | INT | alimenta o valor de venda perdida (P5) |
| `active` | BOOLEAN | default true |

**`shelf_slots`** (nova) — o coração do domínio.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | UUID PK | |
| `device_id` | UUID NOT NULL FK | |
| `slot_index` | SMALLINT NOT NULL | default 0; permite >1 célula por ESP32 sem migration futura |
| `product_id` | UUID FK | nulo = slot não configurado |
| `tare_g` | NUMERIC(10,2) | peso da bandeja vazia |
| `min_qty` | INT NOT NULL | default 3; gatilho de ruptura (P3) |
| `current_qty` | INT | último valor calculado |
| `current_weight_g` | NUMERIC(10,2) | |
| `updated_at` | TIMESTAMPTZ | |

Restrição: `UNIQUE (device_id, slot_index)`.

**`pick_events`** ganha `product_id` e `store_id`. O campo `product_name` **permanece**, de propósito: é snapshot histórico, para que relatórios antigos não mudem se o produto for renomeado depois.

**Seed `V005`:** loja demo, `admin@edgeai.local` vinculado a ela, e os produtos identificados na entrevista do P0.

### Fluxo de dados

```
ESP32 / Wokwi
  publica peso absoluto (g) + weight_stable
      │  MQTT  sensor/data/{device_id}
      ▼
MqttSubscriber → Kafka → SensorConsumer   (inalterados)
      ▼
SensorService.saveSensorPayload()
  grava sensor_data (weight)               (inalterado)
  → ShelfService.processWeight()           (novo)
      1. resolve shelf_slot por device_id + slot_index
      2. qty = round((peso − tare_g) / unit_weight_g)
      3. compara com current_qty, atualiza o slot
      4. caiu  → grava pick_event (quantity = diferença)
      5. subiu → apenas atualiza o slot (reposição)
```

**Anti-ruído.** Uma célula de carga gera dezenas de eventos fantasma por minuto se lida ingenuamente. Só se aceita mudança quando a leitura chega com `weight_stable = true` **e** a diferença é ≥ 60% de uma unidade. A partir do P2, essa decisão passa a ser tomada na borda pelo modelo TFLite; o backend mantém a guarda como rede de segurança.

**`confidence`** deixa de ser um número inventado pelo firmware e passa a medir o que deveria: a proximidade do peso a um múltiplo inteiro de unidades.

**Reposição não vira `pick_event`** — poluiria o gráfico de demanda com vendas que não ocorreram. Fica registrada apenas como atualização do slot.

### Segurança e escopo de loja

`JwtService` hoje carrega apenas o e-mail no `subject`. Ganha um claim `store_id`; o `JwtFilter` o expõe no contexto de autenticação, e todos os repositórios passam a filtrar por loja.

### Endpoints novos

| Método | Rota | Descrição |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/products` | CRUD de produtos da loja |
| GET | `/api/shelf-slots` | Slots da loja com produto, estoque e status |
| PUT | `/api/shelf-slots/{id}` | Vincular produto, definir `min_qty` |
| POST | `/api/shelf-slots/{id}/tare` | Zerar com a prateleira vazia (instalação) |
| GET | `/api/stores/me` | Loja do usuário autenticado |

### Frontend

Uma única tela nova: `/dashboard/settings`, com cadastro de produtos e configuração de slots. Segue o padrão existente (`apiClient`, `usePolling`, Tailwind). Acessibilidade completa é tratada no P4.

### Tratamento de erros

A regra é **nunca perder fato físico**.

| Situação | Comportamento |
|---|---|
| Peso de slot sem produto configurado | Leitura gravada normalmente; slot exibido como "não configurado" com chamada para ação; nenhum `pick_event` é inventado |
| Peso abaixo da tara (bandeja removida) | Satura em zero; slot marcado como suspeito; sem estoque negativo |
| `unit_weight_g` ausente ou zero | Impedido pelo `CHECK` no banco |
| Device de outra loja no MQTT | Rejeitado no consumo, não no controller |
| Produto inativo vinculado a slot | Slot continua contando; alerta de ruptura suprimido |

### Testes (TDD)

**Conversão peso→quantidade** — lógica pura, sem banco. Tabela de casos: múltiplo exato; valor no meio do caminho entre duas unidades; ruído abaixo do limiar; reposição; prateleira vazia; peso abaixo da tara. É onde os bugs reais vão morar e é barato de cobrir.

**Isolamento entre lojas** — usuário da loja A não enxerga device, produto nem `pick_event` da loja B. Este teste **prova** o multi-tenant para a banca, em vez de deixá-lo como afirmação no relatório.

---

## Critérios de aceite do P1

1. Migration `V004` aplica em banco limpo e em banco com dados do PJI510.
2. Um ESP32 publicando peso absoluto atualiza `shelf_slots.current_qty` corretamente.
3. Queda de peso equivalente a ≥ 1 unidade gera exatamente um `pick_event`.
4. Aumento de peso atualiza o slot e **não** gera `pick_event`.
5. Tela `/dashboard/settings` cadastra produto e vincula a um slot, sem recompilar firmware.
6. Botão de tara zera o slot com a prateleira vazia.
7. Teste de isolamento entre lojas passa.
8. Suíte de testes do backend permanece verde.

---

## Sub-projetos seguintes (esboço)

**P2 — Bancada física + Edge AI (36h).** HX711 + célula de carga, tara e calibração, `WEIGHT_STABLE` no firmware, deep sleep. Retreino do modelo TFLite para assinatura de peso; `EloquentTinyML` em `lib_deps`; `USE_TFLITE` ativado e validado no dispositivo e no Wokwi.

**P3 — Alertas + PWA (13h).** Regra de ruptura (`current_qty <= min_qty`) usando a tabela `alerts`, hoje criada e nunca utilizada. Service worker, manifest, instalável, Web Push. Modo de demonstração independente de broker.

**P4 — Acessibilidade e UX (15h).** WCAG 2.1 AA, navegação completa por teclado, contraste, semântica para leitor de tela, responsividade. Fundamentação em LBI (Lei 13.146/2015) e eMAG para o relatório.

**P5 — Plano de negócios (15h).** Entrevista e teste de usabilidade com o comerciante parceiro, Business Model Canvas, custo unitário da bancada, precificação por assinatura, TAM/SAM/SOM do bairro, payback.
