# Relatório Parcial — Bancadas Interativas: Arquitetura, Stack e Estratégia de Expansão para Supermercados

**Projeto:** Edge AI Industrial — Bancadas Interativas
**Disciplina:** PJI610 — Projeto Integrador VI
**Branch:** `feat/bancadas-interativas-dashboard`
**Data:** 2026-09-01
**Equipe:** UNIVESP — Arquitetura PI 6

---

## 1. Contexto e Motivação

O PJI510 entregou um sistema de monitoramento industrial genérico (ESP32 → MQTT →
Spring Boot → Kafka → TimescaleDB → dashboard). O PJI610 exige evoluir esse sistema
para resolver um **problema local real**, com plataforma escalável, desenvolvimento
web/mobile, interface acessível e plano de negócios.

O problema escolhido, validado em visita a um comerciante real (sub-projeto P0,
`docs/pji610/P0-visita-ao-mercadinho.html`), foi a **ruptura de gôndola** no pequeno
varejo alimentar: o produto acaba na prateleira, o lojista não percebe em tempo hábil,
e a venda é perdida para o concorrente mais próximo. É um problema com comprador
identificável, mensurável em reais, e sem exigir nenhum sensor exótico — só uma
célula de carga por baixo de cada prateleira.

O sistema resultante, **Bancadas Interativas**, transforma cada prateleira monitorada
numa "bancada": um dispositivo de borda que pesa o produto continuamente, deriva a
quantidade em unidades, e avisa o lojista — pelo celular — quando o estoque está
prestes a acabar.

---

## 2. Visão Geral da Arquitetura

```
Bancada (ESP32 + HX711)
    │  publica peso absoluto (g) + weight_stable
    │  MQTT   sensor/data/{device_id}   device/status/{device_id}
    ▼
Broker MQTT (EMQX)
    │  Spring Integration MQTT (subscribe sensor/data/# e device/status/#)
    ▼
Backend Spring Boot
    │  Kafka Producer
    ▼
Apache Kafka — tópico sensor-readings
    │  Kafka Consumer
    ▼
SensorService.saveSensorPayload()
    │  grava sensor_data (hypertable)
    ▼
ShelfService.processWeight()
    1. resolve shelf_slot por (device_id, slot_index)
    2. qty = round((peso − tare_g) / unit_weight_g)
    3. compara com current_qty; queda → pick_event; alerta se qty ≤ min_qty
    ▼
PostgreSQL / TimescaleDB
    │  REST API com JWT, escopada por loja (store_id)
    ▼
Dashboard Next.js (PWA)  ──── Web Push ────►  celular do lojista
```

Cada seta é um limite de responsabilidade único, não um detalhe de implementação:

- **A bancada só publica fato físico.** Peso em gramas e um booleano de
  estabilidade — nada de "nome do produto" ou "quantidade" decidido no firmware
  (Decisão D3, seção 4). Trocar o produto de uma prateleira é uma tela, não uma
  regravação de dispositivo.
- **A quantidade é derivada, não contada.** `qty = round((peso − tara) / peso_unitário)`
  é auto-corretivo: uma leitura perdida não desalinha o estoque permanentemente
  (Decisão D2).
- **O broker é público em desenvolvimento.** O ambiente atual usa
  `broker.emqx.io` tanto para o firmware quanto para o backend
  (`mqtt.broker-url` em `application.yml`); o container local `edgeai-emqx` do
  `docker-compose.yml` existe para a topologia de produção mas não está no
  caminho crítico do ambiente de desenvolvimento hoje.
- **A tela é uma PWA, não um app nativo.** Instalável, com Web Push, reaproveitando
  100% do código do dashboard (Decisão D5).

---

## 3. Stack Tecnológica

| Camada | Tecnologia | Versão | Papel |
|---|---|---|---|
| Edge / firmware | ESP32 (Arduino framework via PlatformIO) | — | Leitura da célula de carga, decisão de estabilidade, publicação MQTT |
| | HX711 (`bogde/HX711`) | 0.7.5 | ADC de 24 bits para célula de carga (ponte de Wheatstone) |
| | PubSubClient | 2.8 | Cliente MQTT no firmware |
| | ArduinoJson | 7.0 | Serialização do payload |
| Broker MQTT | EMQX | 5.6 (`emqx/emqx:5.6`) | Pub/sub entre dispositivos e backend |
| Streaming | Apache Kafka | 3.7.0, modo KRaft (sem Zookeeper) | Buffer/desacoplamento entre ingestão MQTT e persistência |
| Backend | Java | 21 | Runtime |
| | Spring Boot | 3.3.0 | Framework da API |
| | Spring Data JPA / Spring Security 6 | — | Persistência e autenticação |
| | Spring Integration MQTT / Spring Kafka | — | Pontes de mensageria |
| | JJWT | 0.12.5 | Emissão/validação de JWT |
| | `nl.martijndwars:web-push` + BouncyCastle | 5.1.1 / 1.78.1 | Envio de notificações push (VAPID) |
| | Testcontainers (Postgres) | — | Testes de integração (isolamento entre lojas) |
| Banco de dados | PostgreSQL + TimescaleDB | `timescale/timescaledb:latest-pg16` | Hypertable de séries temporais (`sensor_data`) + domínio relacional |
| Cache | Redis | 7 (`redis:7-alpine`) | Provisionado na infraestrutura; não está no caminho crítico do fluxo atual |
| Frontend | Next.js (App Router) | 15.5 | Dashboard e PWA |
| | React | 19.0 | UI |
| | TypeScript | 5.4 | Tipagem |
| | Tailwind CSS | 3.4 | Estilo, sobre tokens de design próprios (Nocturne) |
| | Recharts | 2.12 | Gráficos de série temporal |
| | `@phosphor-icons/react` | 2.1 | Iconografia |
| | `mqtt` (mqtt.js) | 5.15 | Publicação MQTT direta do navegador (bancada interativa de teste) |
| | Vitest | 2.1 | Testes da lógica pura (`src/lib`) |
| Simulação / validação de hardware | PlatformIO + Wokwi (extensão VS Code e `wokwi-cli`) | — | Simulação de circuito ESP32+HX711, local ou headless em nuvem |

---

## 4. Decisões de Arquitetura

Resumo das decisões registradas no design spec do PJI610
(`docs/superpowers/specs/2026-08-18-pji610-varejo-design.md`), que orientam por que
o sistema é construído como é:

| # | Decisão | Por quê |
|---|---|---|
| D1 | Kafka, EMQX, TimescaleDB e Spring Boot ficam congelados como estão | Já funcionam e já são a evidência de escalabilidade exigida pela ementa; nenhuma hora do semestre vai para reescrevê-los |
| D2 | Quantidade derivada do peso absoluto, não de um contador incremental | Auto-corretivo: uma leitura perdida não desalinha o estoque; reposição é detectada de graça |
| D3 | Firmware publica só fato físico (peso + estabilidade) | Trocar produto de prateleira não pode exigir recompilar/regravar o dispositivo |
| D4 | Edge AI (TFLite Micro) deve virar filtro anti-ruído essencial, não decorativo | No PJI510 a inferência nunca era carregada no dispositivo real (ver seção 7) |
| D5 | Mobile via PWA, não app nativo | Reaproveita 100% do código web; evitar uma quarta base de código (firmware + backend + web + mobile nativo) inviável no orçamento solo |
| D6 | Todo usuário pertence a exatamente uma loja, sem superadmin global | Multi-loja real (isolamento testado), sem tela de administração que ninguém usaria na banca |

---

## 5. Bancada de Simulação e a Frota de 4 Esteiras

O `wokwi/shelf/` é uma simulação fiel do hardware do P2: HX711 modelado como a ponte
de Wheatstone já fechada das 4 células de meia-ponte, ESP32, LEDs de status e botão
de tara. O firmware nessa pasta espelha as mesmas funções de `ShelfService.java`
(cálculo de quantidade, janela de estabilidade, tolerância), para que o comportamento
do backend seja validável sem precisar do backend rodando.

**Extensão para 4 esteiras simultâneas**, feita nesta sessão como prova de conceito
de escalabilidade horizontal:

- O `DEVICE_ID` do firmware, antes fixo (`wokwi-shelf-001`), passou a ser
  parametrizado por *build flag* (`DEVICE_ID_STR`), com o valor antigo como default.
- `platformio.ini` ganhou 3 *environments* adicionais (`esp32-2/3/4`), cada um
  compilando o mesmo `sketch.ino` com um `device_id` diferente — um binário por
  esteira, gerado por `make sim-build-fleet`.
- Cada esteira ganhou uma pasta própria em `wokwi/shelf/fleet/esteira-{2,3,4}/`
  com seu `wokwi.toml` (apontando para o binário certo) e uma cópia do
  `diagram.json` (fiação idêntica) — permitindo 4 janelas do VS Code rodando o
  simulador visual ao mesmo tempo, ou 4 processos headless via `wokwi-cli`.
- Para demonstração interativa, a amostragem do build de demo
  (`DEMO_NO_NOISE`) foi acelerada de 2000ms para 300ms por leitura — como a
  janela de estabilidade compara as últimas 4 leituras, isso reduziu o atraso
  entre mudar o peso e a tela reagir de ~10s para ~1–2s, sem alterar o
  comportamento do build padrão (o que a bancada física real reproduz).

**Resultado, registrado em vídeo:** as 4 esteiras (`wokwi-shelf-001` a `004`)
publicaram peso de forma independente e simultânea no mesmo broker, e o backend e o
dashboard **as refletiram sem nenhuma mudança de código** em `backend/` ou
`frontend/`. Isso não foi acidental — é consequência direta de duas decisões de
domínio já existentes:

1. `DeviceService.findOrCreate` autorregistra qualquer `device_id` novo que
   publique, sem seed nem lista fixa de dispositivos.
2. `ShelfSlot` já é chaveado por `(device_id, slot_index)` no schema, e o
   frontend (`buildBancadas`) monta a lista de bancadas a partir de `N`
   dispositivos, sem limite hardcoded.

Essa é a evidência concreta, executável e reproduzível de que a plataforma escala
horizontalmente por dispositivo — o requisito de "plataforma escalável" da ementa do
PJI610 deixa de ser uma alegação e passa a ser um resultado demonstrado.

---

## 6. Estratégia de Expansão para Supermercados

Esta seção adianta, em rascunho, parte do escopo do sub-projeto P5 (plano de
negócios, ainda não iniciado — ver seção 7), a pedido do relatório parcial.

### 6.1 Topologia por porte de loja

| Porte | Topologia recomendada | Racional |
|---|---|---|
| Mercadinho / padaria / farmácia (piloto) | 1 ESP32 por prateleira crítica (alto giro ou alta perda por ruptura), Wi-Fi doméstico | É o que já foi validado na entrevista (P0) e na frota de 4 esteiras desta sessão: instalação incremental, sem depender de infraestrutura de rede dedicada |
| Supermercado de médio porte | 1 ESP32 por prateleira monitorada, agrupados por corredor no mesmo AP Wi-Fi | O schema já reserva `slot_index` para múltiplas células por ESP32 (um "gateway" por módulo de gôndola), mas a decisão tomada nesta sessão — **dispositivos independentes**, não um controlador central — foi deliberada: cada prateleira é um domínio de falha isolado, e a instalação continua incremental (uma prateleira de cada vez, sem parar a loja) |
| Rede regional | Múltiplos ESP32 por loja + gateway de agregação de Wi-Fi por corredor | Reduz custo de conectividade em lojas grandes; fora do escopo atual, mas o schema não exige migração para chegar lá |

A escolha de "4 dispositivos independentes" em vez de "1 controlador lendo 4 células"
na frota de teste desta sessão não foi arbitrária: ela é o modelo que generaliza
melhor para o rollout real, porque cada prateleira de um supermercado já é
fisicamente distante das outras — um gateway central exigiria cabeamento que a
topologia atual dispensa.

### 6.2 Instalação e calibração — o runbook operacional

O comando `c` (caracterizar) da bancada de simulação (`wokwi/shelf/README.md`) é o
modelo do processo de instalação real: medir o ruído da célula parada, derivar
`tolerance_g` e a janela de estabilidade, e só depois vincular o produto pela tela.
Isso importa para o rollout porque:

- **Não exige recompilar firmware** (Decisão D3) — um técnico de instalação troca o
  produto vinculado a uma prateleira pela tela, em segundos, sem tocar em código.
- **A calibração é por prateleira, não por loja** — cada célula de carga tem seu
  próprio ruído; o processo de caracterização é o mesmo em 1 ou em 200 prateleiras.
- **Falha de uma bancada não derruba as outras** — consequência direta da topologia
  de dispositivos independentes (seção 6.1).

### 6.3 Modelo de negócio (rascunho)

Sem validação de mercado ainda (isso é o próprio P5), mas como direção:

- **Precificação por assinatura mensal por bancada instalada**, hardware locado —
  reduz a barreira de entrada do lojista de pequeno porte (sem CAPEX inicial), e dá
  receita recorrente previsível, alinhada ao ciclo de vida de um SaaS.
- **Funil de mercado (a validar no P5):**
  - **SOM** — o comerciante parceiro do P0 e o bairro imediato, onde a instalação
    piloto já tem contexto qualitativo levantado.
  - **SAM** — redes de pequeno/médio varejo alimentar da região que reportam
    ruptura de gôndola como problema mensurável.
  - **TAM** — o mercado nacional de pequeno varejo alimentar. A literatura de
    Efficient Consumer Response (GRUEN; CORSTEN; BHARADWAJ, 2002) estima taxa
    média de ruptura de gôndola em torno de 8% dos itens numa loja em um dado
    momento — um ponto de partida citável para dimensionar a oportunidade, a
    substituir por dados primários do comerciante parceiro assim que
    disponíveis.
- **Argumento de venda central:** o custo de uma célula de carga HX711 (a mesma
  validada na bancada Wokwi) é ordens de grandeza menor que o valor de uma única
  ruptura de gôndola não detectada num item de giro rápido — o payback por
  prateleira é rápido e fácil de demonstrar ao lojista com os próprios dados dele
  depois de 2–4 semanas de operação.

### 6.4 Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Dependência de rede/broker no momento da leitura | A inferência de borda (Decisão D4, ver seção 7) reduz o volume de dados que precisa trafegar, mas a leitura de peso em si ainda depende de conectividade — não há um caminho 100% offline hoje |
| Wi-Fi insuficiente em lojas antigas | Fora do escopo atual; LTE-M/NB-IoT é uma extensão possível, não uma dependência do MVP |
| Resistência do lojista a mais um sistema para aprender | PWA instalável sem app nativo (Decisão D5), interface de "gôndola" (pacotes, mínimo, retiradas) em vez de linguagem de "indústria genérica" |
| Custo de instalação por prateleira | Vínculo produto↔prateleira pela tela, sem recompilar firmware (Decisão D3) — instalação não exige presença de quem programou o sistema |

---

## 7. Estado Atual do Projeto

| Sub-projeto | Escopo | Status |
|---|---|---|
| P0 — Descoberta com comerciante real | Entrevista, problema validado | **Concluído** (`docs/pji610/P0-visita-ao-mercadinho.html`) |
| P1 — Núcleo de domínio de varejo | `stores`, `products`, `shelf_slots`, isolamento multi-loja | **Concluído** — migrações V004–V009, tela de produtos/slots, teste de isolamento entre lojas |
| P2 — Bancada física + Edge AI real | HX711 no firmware de produção, TFLite Micro ativado no dispositivo | **Parcial** — a bancada de simulação (`wokwi/shelf/`) tem o caminho de peso completo e validado (incluindo a frota de 4, seção 5); o firmware de produção (`firmware/`) **ainda não tem nenhum caminho de peso**, e `USE_TFLITE` segue desativado — a inferência real cai no fallback por vibração |
| P3 — Alertas + PWA | Regra de ruptura, Web Push, service worker instalável | **Concluído** — manifest, service worker, ícones, push assíncrono fora da thread de ingestão |
| P4 — Acessibilidade e UX | WCAG 2.1 AA, navegação por teclado, contraste | **Não iniciado** — uso pontual de `aria-*`, sem checklist WCAG nem testes de contraste |
| P5 — Plano de negócios | Business Model Canvas, precificação, TAM/SAM/SOM | **Não iniciado** — a seção 6 deste relatório é um rascunho de direção, não o entregável formal do P5 |

**Cobertura de testes hoje:** 148 testes no backend (JUnit + Testcontainers), 32
testes no frontend (Vitest, lógica pura de `src/lib`).

---

## 8. Próximos Passos

1. **Fechar o P2** — portar o caminho de peso (HX711) da bancada de simulação para
   `firmware/`, e ativar `USE_TFLITE` com o modelo já treinado e exportado
   (`firmware/models/train_model.py`), hoje nunca carregado no dispositivo real.
2. **P4 — Acessibilidade** — WCAG 2.1 AA sobre as telas já existentes, com
   fundamentação em LBI (Lei 13.146/2015) e eMAG para o relatório final.
3. **P5 — Plano de negócios formal** — Business Model Canvas, teste de usabilidade
   com o comerciante parceiro, e TAM/SAM/SOM com dados primários em vez da
   estimativa de literatura usada na seção 6.3.
4. **Avaliar `slot_index` multi-célula** — o schema já suporta várias células por
   ESP32 sem migração; vale revisitar o trade-off "1 dispositivo por prateleira vs.
   1 gateway por módulo" quando houver dados reais de custo de instalação em loja
   de porte médio.

---

## Referências Bibliográficas

### Livros e Artigos

GRUEN, Thomas W.; CORSTEN, Daniel S.; BHARADWAJ, Sundar. **Retail Out-of-Stocks: A
Worldwide Examination of Extent, Causes, and Consumer Responses**. Washington, DC:
Grocery Manufacturers of America (GMA) / Food Marketing Institute (FMI), 2002.

CORSTEN, Daniel; GRUEN, Thomas. Stock-Outs Cause Walkouts. **Harvard Business
Review**, v. 82, n. 5, p. 26–28, maio 2004.

SHI, Weisong et al. Edge Computing: Vision and Challenges. **IEEE Internet of
Things Journal**, v. 3, n. 5, p. 637–646, out. 2016. DOI: 10.1109/JIOT.2016.2579198.

### Protocolos e Padrões

OASIS. **MQTT Version 5.0: OASIS Standard**. OASIS Open, 07 mar. 2019. Disponível
em: https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html. Acesso em: 01 set.
2026.

### Documentações Técnicas

ESPRESSIF SYSTEMS. **ESP32 Technical Reference Manual**. v5.2. Xangai, 2024.
Disponível em:
https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf.
Acesso em: 01 set. 2026.

AVIA SEMICONDUCTOR. **HX711 — 24-Bit Analog-to-Digital Converter (ADC) for Weigh
Scales**. Datasheet, rev. 2.0. Xiamen, 2011.

PLATFORMIO LABS. **PlatformIO Documentation**. 2024. Disponível em:
https://docs.platformio.org. Acesso em: 01 set. 2026.

WOKWI. **Wokwi CI/CD Documentation**. Disponível em: https://docs.wokwi.com.
Acesso em: 01 set. 2026.

VMWARE / SPRING TEAM. **Spring Boot Reference Documentation**. v3.3. Disponível em:
https://docs.spring.io/spring-boot/docs/3.3.x/reference/html/. Acesso em: 01 set.
2026.

VERCEL. **Next.js Documentation**. v15. Disponível em: https://nextjs.org/docs.
Acesso em: 01 set. 2026.

TIMESCALE. **TimescaleDB Documentation**. Disponível em:
https://docs.timescale.com. Acesso em: 01 set. 2026.

THE APACHE SOFTWARE FOUNDATION. **Apache Kafka Documentation**. v3.7. Disponível
em: https://kafka.apache.org/37/documentation.html. Acesso em: 01 set. 2026.

EMQ TECHNOLOGIES. **EMQX Documentation**. v5.6. Disponível em:
https://docs.emqx.com/en/emqx/v5.6/. Acesso em: 01 set. 2026.
