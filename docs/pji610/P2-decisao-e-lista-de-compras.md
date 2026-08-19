# P2 — Decisão de escopo e lista de compras

**Data:** 2026-08-18
**Decisão:** o piloto instrumenta **um produto, com um ESP32**.

---

## Por que um produto

O comerciante apontou quatro produtos-piloto (arroz, feijão, açúcar, café). Instrumentar os quatro exigiria uma das duas coisas:

- **quatro ESP32** — sem código novo, ~R$200 a mais, mas quatro cabos sob a gôndola, contra a restrição explícita dele ("não pode ficar soltando fio");
- **um ESP32 multi-slot** — um cabo só, mas 8 a 12 horas de trabalho: payload v3 em lista de slots, `DEFAULT_SLOT` removido de seis pontos do `ShelfService`, dimensão de slot no `sensor_data`, e a assinatura de `processWeight` mudando os nove testes do `ShelfServiceTest`.

Num orçamento de ~95h de construção, 12h é mais de 12% do semestre gasto em generalização que ninguém pediu ainda. E o próprio comerciante definiu o critério:

> "Se funcionar bem em uma prateleira, eu consideraria colocar em outras."

Um produto prova exatamente o que ele quer ver provado — *antes levávamos X para perceber a falta, agora levamos Y* — e prova o ciclo inteiro: célula de carga → inferência na borda → MQTT → backend → contagem → alerta.

A coluna `slot_index` continua no schema, sem uso, esperando. Multi-slot vira trabalho do P2 apenas **se** o piloto convencer.

**Produto escolhido:** Arroz 5 kg (`ARZ001`). É o mais citado, o de maior valor unitário (R$ 29,90 — a venda perdida dói mais) e o de degrau de peso mais generoso, o que ataca diretamente o requisito mais duro dele: nada de alerta falso.

---

## A restrição que decide a compra da célula

A gôndola tem 90 cm. **A bandeja instrumentada não terá 90 cm.**

O problema a evitar é a carga descentralizada: se a leitura depender de *onde* o pacote foi colocado em vez de quanto ele pesa, a contagem não funciona. Uma célula única sob uma bandeja grande sofre disso — é por isso que a primeira versão desta lista pedia uma barra *single point*, que é especificada para plataformas pequenas.

A solução acabou sendo outra, e melhor: **quatro células nos cantos**, que é como uma balança de banheiro funciona. Com um apoio em cada canto, o ponto onde o pacote é colocado deixa de importar — a soma das quatro leituras é o peso total. O tamanho da bandeja deixa de ser uma restrição de especificação e vira uma escolha de instalação.

O piloto instrumenta uma **bandeja de ~30×40 cm** apoiada sobre a prateleira, onde fica a pilha de arroz. Efeito colateral bom: atende a objeção de instalação — é uma bandeja discreta, removível para limpeza, e não uma modificação da gôndola.

**Carga máxima esperada:** 5 unidades × 5 kg = 25 kg de produto, mais a bandeja. Quatro células de 50 kg formam uma plataforma de 200 kg, com folga larga.

---

## Lista de compras

**Correcao de 2026-08-19, apos pesquisa de mercado.** A versao anterior desta lista
pedia uma celula *single point* de barra de 50 kg. Isso estava errado para este
projeto. O que as lojas de eletronica vendem como "celula de carga 50 kg" e um bloco
de 34x34x7 mm com **tres fios**, meia-ponte, do tipo balanca de banheiro, projetado
para trabalhar **em conjunto de quatro**. Barra single point de 50 kg existe, mas e
peca de fornecedor de balanca industrial, vendida sob orcamento.

A correcao melhora o projeto. O risco que motivou a barra era carga descentralizada
numa bandeja grande; quatro celulas nos cantos resolvem exatamente isso, que e como
uma balanca de banheiro funciona.

| Item | Qtd | Preco confirmado | Observacao |
|---|---|---|---|
| Celula de carga 50 kg, meia-ponte, 3 fios | 4 | R$ 7,30 a R$ 11,90 cada | Vao nos quatro cantos da bandeja, ligadas em ponte completa |
| Modulo HX711 (24 bits) | 1 | ~R$ 5,90 | Ha kits com as 4 celulas e o modulo juntos |
| Bandeja | 1 | — | Chapa rigida ~30x40 cm, MDF 15 mm ou acrilico 5 mm. Bandeja que flexiona falseia a leitura |
| Base | 1 | — | Segunda chapa igual, ou fixacao direta na prateleira |
| Parafusos e espacadores | — | — | M4/M5 conforme a rosca. As celulas precisam de folga para fletir |
| ESP32 DevKit v1 | 1 | ja em maos | — |
| Fonte 5 V + cabo USB longo | 1 | — | Um cabo so, conforme a restricao do comerciante |

**Sensoriamento: cerca de R$ 40 a R$ 60.** Piloto completo com bandeja, fixacao e
fonte: aproximadamente **R$ 90 a R$ 140**.

Precos verificados em 2026-08-19 na Curto Circuito, Recicomp, Fabrica de Bolso,
Mekanus e Fulltronic. Confira antes de comprar; variam por vendedor e promocao.

**Nao comprar agora:** nada alem disto. As celulas para as outras tres prateleiras
so fazem sentido se o piloto for aprovado, e ai a compra vem junto da decisao de
multi-slot.

---

## A tolerancia no banco precisa mudar por causa desta escolha

As celulas baratas especificam erro de **0,2% do fundo de escala**. Quatro de 50 kg
formam uma plataforma de 200 kg, portanto o erro absoluto e de cerca de **+/- 400 g**.

O `tolerance_g` semeado para o arroz no `V007` e **75 g**. Com 400 g de erro real,
toda leitura cairia fora da tolerancia e seria marcada como `suspect` — e o P3
suprime alertas em leitura suspeita, justamente para nao anunciar "restam 0 unidades"
quando alguem levanta a bandeja. O resultado seria um sistema silencioso, cujo sintoma
("nunca chega notificacao") e dos mais dificeis de diagnosticar.

Detectar o degrau de 5 kg continua trivial: 400 g de erro contra 5.000 g de passo,
com zona morta de 0,6 unidade. O que muda e so a tolerancia.

**Ao calibrar a bancada, ajustar `products.tolerance_g` do arroz para algo entre 400
e 600 g**, medindo a dispersao real em vez de adotar o numero nominal. O mesmo vale
para os demais produtos se forem instrumentados depois.

---

## Montagem — o detalhe que mais estraga leitura

Cada célula de meia-ponte vai **entre a base e a bandeja, num canto**, parafusada na base por um lado e na bandeja pelo outro, com espaçadores garantindo folga acima e abaixo. Ela mede por deformação: se não puder deformar, não mede.

As quatro células se ligam ao HX711 formando **uma ponte de Wheatstone completa** — é a ligação padrão de balança de banheiro, com os fios agrupados em E+, E−, A+ e A−. Uma célula sozinha não serve sem completar a ponte com resistores, que é justamente o que torna o conjunto de quatro o caminho natural.

Os erros clássicos:

- parafusar os dois lados de uma célula na mesma superfície — ela não deforma e a leitura não muda;
- bandeja encostando na prateleira ou na base em qualquer ponto fora das células — parte do peso escapa pelo apoio e some da conta;
- bandeja empenada ou mole, que distribui a carga de forma imprevisível entre os cantos;
- cabo tensionado — puxa a célula e desloca o zero.

Confira a orientação indicada pelo fabricante em cada célula; montá-las com sentidos trocados faz as leituras se cancelarem parcialmente.

---

## Calibração

1. Bandeja vazia montada → esse valor é a **tara**, gravada pelo botão "Tarar" em `/dashboard/settings`.
2. Peso conhecido em cima (um pacote de arroz já pesado na balança de cozinha) → ajusta o fator de escala do HX711 no firmware.
3. **Pesar três pacotes diferentes e usar a média** como `unit_weight_g`. Hoje o valor no banco é 5000 g nominal. Pacote de 5 kg varia mais que o de 1 kg.
4. **Medir o ruído do conjunto montado**: deixe a bandeja carregada e parada e observe a variação das leituras por alguns minutos. Esse número, e não a variação dos pacotes, é o que dita `tolerance_g` — com quatro células baratas ele deve ficar na casa das centenas de gramas, conforme a seção acima.
5. Repetir a leitura com 1, 2, 3, 4 e 5 pacotes e conferir se a contagem bate. É esse teste que responde "não dá alerta falso".

---

## O que continua em aberto

- A entrevista que originou estes números foi **simulada**. Carta de validação, fotos da gôndola e medição real do peso unitário seguem pendentes.
- `tolerance_g = 75` para o arroz é chute e, pior, é uma ordem de grandeza abaixo do ruído esperado das células escolhidas. Substituir pelo ruído medido na bancada montada, sob pena de o sistema marcar toda leitura como suspeita e nunca alertar.
- Restrição de instalação registrada: sem fio atravessando corredor, Wi-Fi disponível na loja, tomada próxima mas não adjacente.
