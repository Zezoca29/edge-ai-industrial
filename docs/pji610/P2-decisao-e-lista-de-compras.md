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

Uma célula de carga *single point* de barra é especificada para uma plataforma de tamanho limitado — tipicamente até 20×20 cm ou 30×30 cm, conforme o modelo. Uma célula sozinha sob uma bandeja de 90 cm opera fora de especificação: carga fora do centro gera erro grande e não linear, e a leitura passa a depender de *onde* o pacote foi colocado, não de quanto pesa. Isso destruiria a contagem.

O piloto instrumenta uma **bandeja de ~30×40 cm** apoiada sobre a prateleira, onde fica a pilha de arroz. Efeito colateral bom: atende a objeção de instalação — é uma bandeja discreta, removível para limpeza, e não uma modificação da gôndola.

**Carga máxima esperada:** 5 unidades × 5 kg = 25 kg de produto, mais a bandeja. Com margem de segurança, a célula precisa ser de **50 kg**.

---

## Lista de compras

| Item | Especificação | Por que exatamente isto |
|---|---|---|
| Célula de carga | *Single point*, **50 kg**, barra de alumínio, 4 fios | 25 kg de produto + bandeja + margem. Uma de 5 ou 10 kg — a mais comum nos kits — satura e pode se deformar permanentemente |
| Amplificador | Módulo **HX711** (24 bits) | Padrão para célula de 4 fios; a resolução sobra para degraus de 5 kg |
| Bandeja | Chapa rígida ~30×40 cm (MDF 15 mm ou acrílico 5 mm) | Precisa ser rígida: bandeja que flexiona transfere carga para o apoio e falseia a leitura |
| Base | Segunda chapa igual, ou fixação direta na prateleira | A célula vai *entre* as duas, uma ponta em cada |
| Parafusos e espaçadores | M4 ou M5, conforme a rosca da célula | A célula precisa de folga para fletir; encostada nos dois lados ela não mede |
| ESP32 | DevKit v1 (já em mãos) | — |
| Alimentação | Fonte 5 V + cabo USB longo | Um cabo só, conforme a restrição do comerciante |

**Não comprar agora:** as outras três células e HX711. Só fazem sentido se o piloto for aprovado, e aí a compra vem junto da decisão multi-slot.

---

## Montagem — o detalhe que mais estraga leitura

A célula de barra mede por flexão. Ela precisa estar **fixa numa ponta e livre na outra**, com espaçadores garantindo folga acima e abaixo. Os erros clássicos:

- parafusar as duas pontas na mesma superfície — a célula não flete e a leitura não muda;
- bandeja encostando na prateleira em algum ponto — parte do peso escapa pelo apoio;
- cabo da célula tensionado — puxa a barra e desloca o zero.

A seta gravada no corpo da célula indica o sentido da carga, e ela aponta para baixo na montagem correta.

---

## Calibração

1. Bandeja vazia montada → esse valor é a **tara**, gravada pelo botão "Tarar" em `/dashboard/settings`.
2. Peso conhecido em cima (um pacote de arroz já pesado na balança de cozinha) → ajusta o fator de escala do HX711 no firmware.
3. **Pesar três pacotes diferentes e usar a média** como `unit_weight_g`. Hoje o valor no banco é 5000 g nominal, e `tolerance_g = 75` é estimativa, não medição. Pacote de 5 kg varia mais que o de 1 kg.
4. Repetir a leitura com 1, 2, 3, 4 e 5 pacotes e conferir se a contagem bate. É esse teste que responde "não dá alerta falso".

---

## O que continua em aberto

- A entrevista que originou estes números foi **simulada**. Carta de validação, fotos da gôndola e medição real do peso unitário seguem pendentes.
- `tolerance_g = 75` para o arroz é chute; substituir pela dispersão medida dos três pacotes.
- Restrição de instalação registrada: sem fio atravessando corredor, Wi-Fi disponível na loja, tomada próxima mas não adjacente.
