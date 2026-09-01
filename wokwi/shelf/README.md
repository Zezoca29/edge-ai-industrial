# Bancada Wokwi — balança de prateleira (P2)

Simulação do hardware definido em [P2 — Decisão de escopo e lista de compras](../../docs/pji610/P2-decisao-e-lista-de-compras.md): 4 células de carga de 50 kg meia-ponte → HX711 → ESP32 DevKit v1.

Esta bancada não existe para "ver a balança funcionar". Ela existe para produzir **dois números que hoje são chute no projeto**:

| Número | Valor atual | De onde veio |
|---|---|---|
| `products.tolerance_g` do arroz | 75 g | chute semeado no `V007` |
| janela de estabilidade do firmware | 10 g | `WEIGHT_STABLE_TOLERANCE_KG = 0.010` |

Com o ruído real das células escolhidas, **os dois estão errados e o sistema fica mudo**. O comando `c` mede o ruído e deriva os valores certos — que é o passo 4 da seção Calibração do P2, automatizado.

---

## Como rodar

**Navegador:** crie um projeto ESP32 em [wokwi.com](https://wokwi.com/projects/new/esp32), cole `diagram.json` e `sketch.ino` nas abas correspondentes e adicione as bibliotecas de `libraries.txt` pelo **Library Manager**.

**Linha de comando ou extensão do VS Code:**

```bash
wokwi-cli --scenario scenario.yaml --timeout 300000 wokwi/shelf
```

O timeout precisa ser generoso — só a caracterização coleta 60 leituras.

## Arquivos

| Arquivo | O que é |
|---|---|
| `diagram.json` | ESP32 + HX711 + LED verde/vermelho + botão de tara |
| `sketch.ino` | Firmware, com espelho fiel do `ShelfCalculator` e do `ShelfService` |
| `scenario.yaml` | Roteiro de 9 atos, do boot à bandeja levantada |
| `libraries.txt` | HX711 / PubSubClient / ArduinoJson |

## Comandos

| Tecla | Efeito |
|---|---|
| `t` ou botão azul | Tarar — equivale ao botão "Tarar" em `/dashboard/settings` |
| `c` | **Caracterizar**: mede o ruído e deriva `tolerance_g` + janela de estabilidade |
| `p` | Próxima posição da carga sobre a bandeja (análise dos 4 cantos) |
| `n` | Liga/desliga a injeção de ruído das células baratas |
| `v` | Mostrar valores em vigor |
| `?` | Ajuda |

LED verde = leitura contou. Vermelho = suspeita, o backend ignora. Ambos apagados = instável, o backend descarta antes de tudo.

**A bancada parte dos valores errados de propósito.** Rodar sem caracterizar reproduz a falha real, em vez de escondê-la.

---

## Como a caracterização deriva os números

Ela coleta 60 leituras com a bandeja carregada e parada, e calcula:

```
sigma_95   = sigma_medido x (1 + 1,96 / sqrt(2(N-1)))
tolerance_g            = 4,0 x sigma_95   arredondado para cima em degraus de 25 g
janela de estabilidade = 3,5 x sigma_95   arredondado para cima em degraus de 25 g
```

**Por que do limite superior e não do sigma medido:** um sigma estimado de 60 leituras tem intervalo de 95% de ±18%. Derivar do valor medido produziria números apertados demais em metade das calibrações, e o sintoma disso é silêncio, não erro. O limite superior faz a recomendação parar de depender da sorte da amostra.

**Por que 4σ na tolerância:** o flag `suspect` existe para pegar bandeja levantada e pacote fora do degrau. Se o ruído normal já o dispara, ele perde a função e o P3 passa a suprimir alerta legítimo. A 4σ, ~0,006% das leituras viram suspeitas por ruído puro.

**Por que 3,5σ na janela:** para 4 amostras normais, a amplitude tem média 2,06σ e desvio 0,88σ (constantes d2/d3 de controle estatístico). 3,5σ é média + 1,65 desvios, cobrindo ~95% das janelas. Apertar mais não melhora exatidão — só faz `processWeight` descartar leitura boa.

A saída inclui um aviso se a tolerância derivada passar de 40% do degrau de um pacote: nessa faixa a contagem começa a confundir pacote com ruído, e o problema é de montagem (bandeja mole, cabo tensionado, célula sem folga), não de software.

---

## O que a simulação representa — e o que não representa

O `wokwi-hx711` modela **a ponte de Wheatstone já fechada**, que é exatamente o que o HX711 enxerga. Quatro meia-pontes ligadas em anel *são* um sensor de 4 fios. O diagrama tem um bloco e não quatro porque isso está eletricamente correto, não simplificado.

**Fielmente simulado:** protocolo HX711 (DT/SCK), quantização real do ADC, conversão bruto → gramas → unidades, tara, zona morta, `tolerance_g`, flag `suspect`, `weight_stable`, payload MQTT idêntico ao `SensorPayloadDto` em `sensor/data/{device_id}`, e as regras de pick event e de alerta do `ShelfService`.

**Não simulado pelo Wokwi — tratado de outro jeito:**

| O quê | Como foi tratado |
|---|---|
| Ruído de ±400 g (0,2% FS de uma plataforma de 200 kg) | Injetado no firmware, desligável com `n` |
| Valores brutos ~100× menores que o hardware real ([wokwi-features#872](https://github.com/wokwi/wokwi-features/issues/872)) | `SIM_COUNTS_PER_GRAM` vale **só aqui** |
| Repartição da carga entre os 4 cantos | Calculada em software (comando `p`) e marcada como **análise, não medição** |
| Célula montada ao contrário, bandeja encostando, cabo tensionado | **Impossível de simular.** É o que a bancada física tem que provar |
| Deriva térmica, fluência (creep) | Não simulado |

> Não use o fator de calibração desta simulação no hardware, e não use esta simulação como evidência de metrologia. Ela valida software; a física é da bancada real.

---

## O que a bancada mostrou ao rodar

Execução determinística completa (semente fixa), das 9 cenas do roteiro:

**1. Com os números do projeto hoje, nada conta.** Oito leituras seguidas de 5 pacotes, todas descartadas como instáveis, sem uma linha de erro em lugar nenhum.

**2. A caracterização derivou:**

```
sigma medido ... 105,8 g  (+/- 18% com 60 leituras)
sigma_95 ....... 124,9 g
tolerance_g .... 500 g      (10,0% do degrau de um pacote — OK)
janela ......... 450 g
UPDATE products SET tolerance_g = 500 WHERE sku = 'ARZ001';
```

**3. Com esses números, o pipeline inteiro funciona:** contagem correta em 5, 4 e 3 pacotes, exatamente **2 pick events** (5→4 e 4→3) e exatamente **1 alerta** de estoque baixo ao tocar `min_qty`.

**4. Carga fora do degrau** (3,5 pacotes) → `SUSPEITA`, sem inventar pick event nem alerta.

**5. Bandeja levantada** → `SUSPEITA`, `qty 0`, sem anunciar "restam 0 unidades".

**6. Análise dos cantos**, 25,2 kg empilhados num canto de uma bandeja 40×30:

```
esq-tras    0,5 kg | dir-tras    2,1 kg
esq-frente  2,6 kg | dir-frente 21,2 kg
soma = 26,4 kg — invariante com a posicao
pior canto: 21,2 kg de 50 kg (42% da capacidade)
```

A soma não muda com a posição, e mesmo no pior empilhamento a célula mais carregada usa 42% da capacidade. As duas afirmações centrais do P2, confirmadas.

---

## Achados sobre o projeto

### 1. A falha dominante não é a tolerância — e o firmware de produção nem lê peso

`ShelfService.processWeight` descarta leitura instável **na primeira linha** (`if (!stable) return;`), antes de olhar tolerância. E `firmware/` **não tem nenhum caminho de peso**: sem HX711, sem célula de carga, sem `weight_stable`. Quem produz peso hoje é só o sketch do Wokwi e o simulador Python.

Os dois caminhos óbvios falham:

- **Adotar o critério que já existe no sketch antigo** (`WEIGHT_STABLE_TOLERANCE_KG = 0.010`, 10 g): com 125 g de desvio nunca fecha — zero em 20.000 num Monte Carlo à parte.
- **Omitir o campo:** o backend trata ausente como estável (`!Boolean.FALSE.equals(null)` → `true`), então toda leitura ruidosa passa e só a tolerância segura.

O sintoma é o que o P2 descreve — "nunca chega notificação" — mas a causa está no firmware, não no banco. **Corrigir só `products.tolerance_g` não resolveria nada.**

### 2. A tolerância semeada descartaria 56% das leituras, não todas

O P2 diz "toda leitura cairia fora da tolerância". Com o ruído filtrado por média de 10 amostras, o número é **56%**. Continua inaceitável, mas o texto está mais forte do que os dados sustentam.

### 3. O backend estourava NPE se o nó de prateleira omitisse temperatura — **corrigido**

`SensorService.saveSensorPayload` chamava `s.getTemperature().getValue()` sem checagem de nulo; só `weight` estava protegido. O nó do P2 não tem DHT22 nem sensor de corrente, e omitir esses campos levava junto a leitura de peso.

Cada grandeza passou a ser opcional (`SensorService.insertIfPresent`), coberta pelo teste `saveSensorPayloadAcceptsAShelfNodeThatReportsOnlyWeight`. Este firmware agora publica **só peso**, como o hardware real.

### 4. `min_qty` do arroz não estava semeado — **corrigido**

O comentário do `V007` anotava "repor com 5 unidades", mas nenhum `INSERT` gravava: `min_qty` vive em `shelf_slots`, e no momento do seed nenhum slot existe ainda. O número ficava perdido no SQL.

O mínimo é propriedade do **produto** — mudar o arroz de gôndola não muda com quantas unidades ele precisa ser reposto. A migração `V009` adiciona `products.default_min_qty` e semeia os quatro números do P0; `ShelfSlotController` adota o valor **no vínculo**, e só nele: um salvamento posterior não desfaz o mínimo que o lojista ajustou na tela.

A bancada continua usando 3, que é o `DEFAULT` com que um slot nasce antes de receber produto.

---


## Ver e interagir sem a fila de build do Wokwi

A fila de build gratuita do Wokwi web às vezes engarrafa. Duas alternativas que
compilam/rodam local:

**Bancada interativa no navegador** — coloque e tire pacotes, veja o peso, a
contagem e o retorno do backend em tempo real:

```bash
make bancada   # http://127.0.0.1:8090/bancada-interativa.html
```

Publica no mesmo broker do ESP32, então o backend e o dashboard reagem junto.
O `live-panel.html` (mesma URL, outro arquivo) é a versão só-monitor, para
assistir a um dispositivo real publicando.

**Circuito interativo no VS Code** — extensão "Wokwi Simulator", compilando com
PlatformIO (sem fila):

```bash
make sim-build            # compila o firmware.elf/.bin em .pio/
# VS Code: Ctrl+Shift+P -> "Wokwi: Start Simulator"
```

O `platformio.ini` desta pasta compila o próprio `sketch.ino` (via `src_dir=.`)
e liga com `-DDEMO_NO_NOISE`, para o circuito reagir na hora ao arrastar o peso
no HX711 sem precisar caracterizar. O `wokwi.toml` aponta o simulador para o
binário gerado. O padrão do projeto (fora desta build) mantém o ruído ligado.

---

## Frota de 4 esteiras

Cada esteira é um dispositivo independente — mesmo circuito, mesmo firmware,
só o `device_id` muda. Backend e frontend já são genéricos por dispositivo
(qualquer `device_id` novo se autorregistra na primeira publicação e aparece
sozinho em `/dashboard/bancadas`), então rodar as 4 juntas não muda nada de
código fora desta pasta.

```bash
make sim-build-fleet      # compila esp32 (001), esp32-2/3/4 (002-004)
```

Isso gera um binário por esteira em `.pio/build/esp32[-N]/`, todos a partir
do mesmo `sketch.ino` — só o `DEVICE_ID_STR` de cada `env` no
`platformio.ini` muda (`-D DEVICE_ID_STR=\"wokwi-shelf-00N\"`).

Para rodar as 4 simulações ao mesmo tempo no VS Code, abra uma janela por
esteira (a esteira 1 é a raiz desta pasta; as outras três estão em
`fleet/esteira-2`, `fleet/esteira-3`, `fleet/esteira-4`, cada uma com seu
próprio `wokwi.toml` + `diagram.json` apontando pro binário certo) e rode
"Wokwi: Start Simulator" em cada janela:

```bash
code wokwi/shelf                    # esteira 1 (wokwi-shelf-001)
code wokwi/shelf/fleet/esteira-2    # esteira 2 (wokwi-shelf-002)
code wokwi/shelf/fleet/esteira-3    # esteira 3 (wokwi-shelf-003)
code wokwi/shelf/fleet/esteira-4    # esteira 4 (wokwi-shelf-004)
```

Cada janela publica no mesmo broker (`broker.emqx.io`) com seu próprio
`device_id`; o dashboard mostra as 4 bancadas assim que a primeira leitura de
cada uma chegar. `PRODUCT_SKU` no firmware é só log local — o vínculo com
produto de verdade é feito em `/dashboard/bancadas` (ou no antigo Ajustes),
igual pra qualquer dispositivo novo.

---

## Verificação

| O quê | Como | Resultado |
|---|---|---|
| Espelho do `ShelfCalculator` | Funções extraídas do próprio `sketch.ino` e rodadas contra os casos do `ShelfCalculatorTest` | **51 verificações, 0 falhas** — incluindo as bordas exatas (`residual == tolerance` não é suspeito; deadband em 4.4 mantém a contagem) |
| Compilação | `g++ -Wall -Wextra`, caminho sem MQTT, contra stubs de Arduino/HX711 | limpo, zero avisos |
| Execução | Harness offline com o HX711 modelado como o `wokwi-hx711` (420 contagens/kg, quantização inteira) | roteiro de 9 atos completo, resultados acima |
| `diagram.json` / `scenario.yaml` | Validação sintática, referências de peças | sem pendência |

**Não verificado:** a simulação não foi executada dentro do Wokwi. O caminho WiFi/MQTT e a resposta do `wokwi-hx711` ao `set-control: load` só se confirmam abrindo o projeto. Se o HX711 não responder com VCC em 3V3, mude para `esp:VIN` — mas no hardware real 3,3 V continua sendo a escolha certa, porque o DOUT em 5 V fica fora de especificação para o ESP32.
