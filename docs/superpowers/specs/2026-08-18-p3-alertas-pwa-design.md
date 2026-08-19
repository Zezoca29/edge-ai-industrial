# P3 — Alertas de Ruptura e PWA — Design Spec

**Data:** 2026-08-18
**Projeto:** Edge AI Industrial — UNIVESP PJI610 (Projeto Integrador VI)
**Sub-projeto:** P3, conforme a decomposição em `2026-08-18-pji610-varejo-design.md`
**Orçamento:** 16–18h — revisado para cima. A decomposição original reservou 13h ao P3, antes de o desenho existir. Somando migration, `AlertService`, a regra no `ShelfService`, o scheduler, o envio de push, cinco endpoints, service worker, manifesto, a tela de alertas e os testes, 13h não se sustenta. As 3–5h extras saem do P4, que é a frente com mais gordura; se apertar, o que se corta é profundidade de acessibilidade, não os itens de ementa.

**Escopo:** Transformar a contagem de estoque que o P1 produz em aviso que chega ao celular do comerciante, e tornar o dashboard instalável — atendendo ao requisito de desenvolvimento para dispositivos móveis da ementa do PJI610.

---

## Contexto

O P1 entregou a contagem: cada leitura de peso vira quantidade de unidades em `shelf_slots.current_qty`, com `min_qty` configurável por prateleira. Nada acontece quando essa quantidade cai.

A tabela `alerts` existe desde o PJI510 — `device_id`, `alert_type`, `severity`, `message`, `acknowledged`, `acknowledged_by`, `acknowledged_at`, `created_at` — e nunca recebeu uma linha. O diretório `alerts/` contém apenas um README prometendo push, e-mail, WebSocket e webhooks. O `spring-boot-starter-websocket` está no `build.gradle` sem uso.

**Requisito mais duro, nas palavras do comerciante:**

> "Eu não gostaria de receber um monte de alerta falso. Se começar a apitar toda hora sem necessidade, o funcionário vai ignorar."

Todo o desenho abaixo é subordinado a isso.

---

## Decisões

### D1 — HTTPS por túnel, apenas durante a demonstração

Service worker e Web Push exigem contexto seguro. Um celular na Wi-Fi da loja abrindo `http://192.168.0.x:3000` não instala o PWA nem recebe push, e o navegador recusa em silêncio. No iOS, push exige adicionalmente que o PWA esteja instalado na tela de início (16.4+).

`cloudflared` ou `ngrok` expõem o Next.js local com HTTPS válido, sem custo e sem hospedagem.

**Consequência aceita:** a URL muda a cada sessão do túnel. Inscrição de push é vinculada à origem, então a inscrição anterior morre junto com a URL anterior. O roteiro de demonstração inclui reativar os alertas no celular depois de subir o túnel — passo explícito, não surpresa.

Descartado: deploy real em Vercel + backend hospedado. Mais defensável, mas é trabalho de infraestrutura e custo mensal fora do orçamento do semestre.

### D2 — Alerta é transição, não estado

Uma regra escrita como "estoque ≤ mínimo dispara" dispara a cada leitura enquanto a prateleira continuar baixa. Em minutos o funcionário aprende a ignorar, que é exatamente a falha que o comerciante nomeou.

Um alerta nasce no instante em que a quantidade **cruza** o limiar para baixo, e apenas se não houver alerta do mesmo tipo ainda aberto para aquela prateleira.

### D3 — A deduplicação é garantida pelo banco

Índice único parcial sobre alertas não resolvidos. Duplicata passa a ser impossível, não improvável: se dois caminhos tentarem abrir o mesmo alerta simultaneamente, o segundo é recusado pelo PostgreSQL. Mais barato e mais confiável que qualquer trava no serviço.

### D4 — Resolução automática, sem botão de "resolver"

Estoque volta a subir acima do mínimo, o alerta se resolve. Dispositivo volta a reportar, o alerta de silêncio se fecha. Pedir confirmação manual do que o sistema já sabe é burocracia, e alertas velhos abertos acumulam até a lista virar lixo.

O campo `acknowledged`, que já existe, passa a significar "eu vi isso" — some da lista sem exigir que a prateleira tenha sido reposta. *Visto* e *resolvido* são estados diferentes e a tabela já comporta os dois.

Precisamente: a lista padrão (`onlyOpen=true`) mostra alertas com `resolved_at` nulo **e** `acknowledged = false`. O contador do menu conta essa mesma lista. Um alerta visto mas ainda não resolvido continua existindo, aparece em `onlyOpen=false`, e **não** volta a gerar push — a prateleira continua baixa, mas o dono já sabe.

### D5 — Cada regra roda onde ela pertence

**Ruptura** é avaliada no `ShelfService`, no instante em que a quantidade muda: ali a transição exata (`previousQty` → `nextQty`) já está em mãos, sem varredura.

**Sensor mudo** é um scheduler, porque ausência de evento não se anuncia — quando nada chega, nada executa.

Descartado: scheduler puro para as duas regras (varreria estado para redescobrir o que a ingestão já sabia) e tópico Kafka de alertas (mais peças para quebrar no dia da apresentação, e ainda precisaria do scheduler para o silêncio).

### D6 — O envio do push sai da transação

O `AlertService` grava o alerta e publica um evento de aplicação; um ouvinte com `AFTER_COMMIT` e `@Async` envia a notificação.

- O alerta existe no banco mesmo que o push falhe. A lista no dashboard é a fonte de verdade; o push é entrega.
- A ingestão de leituras nunca espera rede externa.
- A regra fica testável sem infraestrutura de push: o teste verifica que o evento foi publicado, não que a notificação chegou.

### D7 — Service worker escrito à mão

Sem `next-pwa` nem Workbox: uma dependência e uma camada de build inteira para gerar um arquivo de poucas dezenas de linhas.

O handler de `fetch` não é opcional — o Chrome só oferece a instalação quando existe service worker com `fetch`. Sem instalação, o iOS não entrega push. Essa handler pequena é o que destrava o requisito de dispositivos móveis nos dois sistemas.

### D8 — O alerta não estima dinheiro

A mensagem é factual: *"Arroz 5 kg: restam 4 unidades, mínimo 5"*. Sem "você está perdendo R$ X por hora", que é extrapolação. Um alerta que exagera perde a confiança de que o produto inteiro depende. O `unit_price_cents` serve à análise do P5.

### D9 — O limiar de silêncio é configuração

Padrão de 10 minutos, ajustável. O simulador publica a cada 5 s, mas o firmware do P2 usará *deep sleep* para atender à restrição de não passar fio pelo corredor, e um dispositivo que acorda de 5 em 5 minutos não pode ser declarado morto por economizar bateria. Valor fixo no código viraria alarme falso assim que a bancada real entrasse.

### D10 — Sem modo de demonstração em software

A ruptura será provocada à mão, tirando pacotes da bandeja diante da banca — a demonstração mais convincente possível, a custo zero de desenvolvimento.

**Risco aceito:** a apresentação passa a depender da bancada do P2 estar funcionando no dia. O simulador Python com parâmetros acelerados fica como rede de segurança, sem trabalho novo.

---

## Modelo de dados — migration `V008`

**`alerts`** ganha três colunas:

| Coluna | Tipo | Nota |
|---|---|---|
| `store_id` | UUID NOT NULL REFERENCES stores(id) | escopo de loja, como todo o resto do sistema |
| `shelf_slot_id` | UUID REFERENCES shelf_slots(id) | nulo para alertas de dispositivo |
| `resolved_at` | TIMESTAMPTZ | nulo enquanto aberto |

Backfill não se aplica: a tabela está vazia.

**Índices únicos parciais** — a garantia de D3:

```sql
CREATE UNIQUE INDEX idx_alerts_open_slot ON alerts (shelf_slot_id, alert_type)
    WHERE resolved_at IS NULL AND shelf_slot_id IS NOT NULL;

CREATE UNIQUE INDEX idx_alerts_open_device ON alerts (device_id, alert_type)
    WHERE resolved_at IS NULL AND shelf_slot_id IS NULL;
```

Dois índices porque as duas regras têm chaves de unicidade diferentes: ruptura é por prateleira, silêncio é por dispositivo.

**`push_subscriptions`** (nova):

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL REFERENCES users(id) | |
| `store_id` | UUID NOT NULL REFERENCES stores(id) | destino do envio |
| `endpoint` | TEXT NOT NULL UNIQUE | identifica a inscrição no serviço de push |
| `p256dh` | TEXT NOT NULL | chave pública do cliente |
| `auth` | TEXT NOT NULL | segredo de autenticação |
| `failure_count` | INT NOT NULL DEFAULT 0 | |
| `created_at` / `last_success_at` | TIMESTAMPTZ | |

**Vocabulário de alerta:**

| `alert_type` | `severity` | Quando |
|---|---|---|
| `stock_low` | `high` | `current_qty` cruza para ≤ `min_qty` |
| `device_silent` | `medium` | `last_seen_at` mais antigo que o limiar |

---

## Componentes

### `AlertService` (novo)

```
open(storeId, deviceId, slotId, type, severity, message)
    -> grava se não houver aberto do mesmo tipo; publica AlertOpenedEvent
resolve(slotId | deviceId, type)
    -> preenche resolved_at do alerta aberto, se houver
acknowledge(alertId, userId)   -> marca visto
listForStore(storeId, onlyOpen)
```

A tentativa de abrir um alerta duplicado é tratada como caso normal, não erro: a violação do índice parcial é capturada e a operação vira no-op.

### Regra de ruptura — dentro de `ShelfService`

Após atualizar o slot, com `previousQty` e `nextQty` em mãos:

- `previousQty > minQty` e `nextQty <= minQty` → `alertService.open(...)`
- `previousQty <= minQty` e `nextQty > minQty` → `alertService.resolve(...)`
- produto inativo → suprime, conforme a spec do P1
- slot não configurado ou `currentQty` nulo → nada

A proteção contra oscilação já existe na zona morta de 0,6 unidade do `ShelfCalculator`. O alerta não precisa de debounce próprio: o trabalho contra ruído foi feito uma vez, embaixo, e todo consumidor acima colhe.

### `DeviceSilenceMonitor` (novo)

`@Scheduled(fixedDelay = 60_000)`, com `fixedDelay` e não `fixedRate` para que execuções não se empilhem se uma demorar.

Varre dispositivos: `last_seen_at` mais antigo que o limiar e sem alerta aberto → abre; `last_seen_at` recente e com alerta aberto → resolve.

Recebe um `java.time.Clock` injetado, para que o teste avance dez minutos em uma linha em vez de dormir.

### `PushSender` (novo)

Ouvinte `@TransactionalEventListener(phase = AFTER_COMMIT)` + `@Async`. Busca as inscrições da loja e envia.

| Resposta | Ação |
|---|---|
| 404 ou 410 | inscrição morta — apagar imediatamente |
| outro erro / rede | incrementa `failure_count`, mantém, registra log |
| sucesso | atualiza `last_success_at` |

Biblioteca de web push para Java (traz BouncyCastle); a versão exata é fixada no plano de implementação.

Chaves VAPID: pública exposta por endpoint, privada em variável de ambiente. **Nenhuma das duas entra no repositório.**

### Frontend

**`public/manifest.json`** — nome, ícones 192 e 512, `display: standalone`, `start_url` no dashboard.

**`public/sw.js`** — três responsabilidades: evento `push` mostra a notificação; `notificationclick` abre `/dashboard/alerts`; `fetch` mínimo com fallback offline, que é o que torna o app instalável.

**`/dashboard/alerts`** — lista com produto, quantidade restante, horário de abertura e estado. Botão "Ativar alertas neste aparelho" no topo.

**Contador de alertas abertos** no menu lateral — é o que faz alguém abrir a página sem ter sido avisado.

A permissão de notificação é pedida **apenas por gesto explícito do usuário**, nunca ao carregar a página. Pedir na chegada é o erro clássico: o usuário nega por reflexo e nenhum navegador pergunta de novo. Uma negação permanente no celular do comerciante só seria reversível nas configurações do sistema.

---

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/alerts?onlyOpen=true` | Alertas da loja |
| POST | `/api/alerts/{id}/acknowledge` | Marca como visto |
| GET | `/api/push/public-key` | Chave VAPID pública |
| POST | `/api/push/subscriptions` | Registra inscrição do aparelho |
| DELETE | `/api/push/subscriptions` | Remove inscrição, pelo endpoint |

Todos escopados por `CurrentStore.id()`, como o restante da API.

---

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| Push devolve 404 ou 410 | Inscrição apagada imediatamente |
| Push falha por rede ou 500 | Contador incrementado, inscrição mantida, log |
| Loja sem nenhuma inscrição | Alerta gravado, nada enviado. Não é erro — é o estado antes de alguém ativar |
| Alerta duplicado (índice parcial) | Capturado e tratado como no-op |
| Permissão negada pelo usuário | Interface explica como reverter nas configurações do navegador |
| Navegador sem service worker | Botão escondido, com o motivo visível |
| Dispositivo sem loja | Nenhum alerta — não há para quem enviar |

---

## Testes

**Transições da regra de ruptura**, com repositórios mockados: acima→no mínimo (abre), no mínimo→abaixo (não duplica), abaixo→acima (resolve), slot não configurado, produto inativo.

**Deduplicação**, no `StoreIsolationIntegrationTest` que já existe com Testcontainers: mock não prova índice parcial. A segunda tentativa de abrir o mesmo alerta precisa ser recusada pelo banco real.

**Silêncio de dispositivo**, com `Clock` fixo: dispositivo mudo além do limiar abre alerta; dispositivo que volta resolve; dispositivo dentro do limiar não abre nada.

**`PushSender`**: resposta 410 apaga a inscrição; erro de rede mantém e incrementa.

**Isolamento**: alerta da loja B não aparece para usuário da loja A.

**Service worker**: sem teste automatizado — é código de navegador. Roteiro manual: instalar na tela de início, receber notificação com o app fechado, clicar e cair na página de alertas.

---

## Critérios de aceite

1. Retirar unidades até cruzar `min_qty` gera exatamente um alerta `stock_low`.
2. Continuar retirando não gera alertas adicionais.
3. Repor acima do mínimo resolve o alerta automaticamente.
4. Dispositivo parado além do limiar gera um alerta `device_silent`; voltar a reportar resolve.
5. O dashboard instala como aplicativo em Android e iOS através do túnel HTTPS.
6. Com o app fechado, o alerta chega como notificação do sistema.
7. Clicar na notificação abre a lista de alertas.
8. Inscrição inválida é removida na primeira resposta 410.
9. Alertas de uma loja não aparecem para usuário de outra.
10. Suíte de backend permanece verde.

---

## Fora de escopo (YAGNI)

E-mail, webhooks e WebSocket — os três prometidos no README de `alerts/`. O push cobre o caso de uso, e a lista no dashboard já atualiza por polling a cada 10 s.

Também fora: preferências de notificação por usuário, silenciar horários, histórico de entrega, e alerta de leitura suspeita (o tipo mais propenso a virar barulho, contra o requisito central do comerciante).
