/*
 * Edge AI Industrial - Bancada da balanca de prateleira
 * UNIVESP PI-5 / PJI610 - hardware definido no P2
 *
 * Hardware representado:
 *   4x celula de carga 50 kg meia-ponte (3 fios), ligadas em anel formando
 *   uma ponte de Wheatstone completa -> HX711 -> ESP32 DevKit v1.
 *
 * O wokwi-hx711 modela a ponte JA FECHADA, que e exatamente o que o HX711
 * enxerga. Eletricamente, quatro meia-pontes em anel SAO um sensor de 4 fios;
 * por isso o diagrama tem um bloco e nao quatro. A reparticao da carga entre
 * os cantos e calculada aqui em software (comando 'p'), porque e analise, nao
 * medicao - e esta claramente marcada como tal na saida.
 *
 * -- Para que serve esta bancada ---------------------------------
 *
 * Nao para "ver a balanca funcionar". Para produzir DOIS numeros que hoje sao
 * chute no projeto:
 *
 *   products.tolerance_g   (hoje 75 g para o arroz, semeado no V007)
 *   a janela de estabilidade   (o firmware de producao ainda nao le peso;
 *                               o unico criterio que existe no projeto e o
 *                               dos 10 g do wokwi/sketch.ino antigo)
 *
 * O comando 'c' mede o ruido do conjunto parado e DERIVA os dois, que e
 * exatamente o passo 4 da secao Calibracao do P2. Nao ha perfil para alternar
 * a mao: ou voce mediu, ou esta chutando.
 *
 * -- Comandos (Monitor Serial) -----------------------------------
 *   t  tarar (equivale ao botao "Tarar" em /dashboard/settings)
 *   c  caracterizar o ruido e derivar tolerance_g + janela de estabilidade
 *   p  proxima posicao de carga sobre a bandeja (analise dos 4 cantos)
 *   n  liga/desliga a injecao de ruido das celulas baratas
 *   v  mostrar valores em vigor
 *   ?  ajuda
 */

#define ENABLE_MQTT 1

#include <Arduino.h>
#include <HX711.h>
#include <math.h>

#if ENABLE_MQTT
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#endif

// === Pinos =================================================================
#define HX711_DT    16
#define HX711_SCK    4
#define LED_OK       2   // verde   - leitura contou
#define LED_SUSPECT  5   // vermelho - leitura suspeita, o backend ignora
#define BTN_TARE    18

// === Calibracao do simulador ===============================================
// O wokwi-hx711 tipo "50kg" mapeia 0..50 kg em 0..21000 contagens, ou seja
// 0,42 contagem por grama. set_scale() com esse valor faz get_units() devolver
// GRAMAS direto.
//
// ATENCAO: vale SO no simulador. O Wokwi emite ~100x menos contagens que o
// hardware real (wokwi-features#872). O fator da bancada fisica tera outra
// ordem de grandeza e sai da calibracao com peso conhecido, nunca daqui.
static const float SIM_COUNTS_PER_GRAM = 0.42f;

// === Produto instrumentado (products, V007, SKU ARZ001) ====================
static const char*  PRODUCT_NAME  = "Arroz 5 kg";
static const char*  PRODUCT_SKU   = "ARZ001";
static const double UNIT_WEIGHT_G = 5000.0;

// shelf_slots.min_qty tem DEFAULT 3 no V004. O comentario do V007 anota
// "repor com 5 unidades" para o arroz, mas nenhum INSERT semeia isso - o valor
// real vem da tela de configuracao. A bancada usa o default do banco.
static const int MIN_QTY = 3;

// Espelha ShelfCalculator.DEADBAND_UNITS.
static const double DEADBAND_UNITS = 0.6;

// === Bandeja e celulas (P2) ================================================
static const float TRAY_W_CM      = 40.0f;   // largura da bandeja
static const float TRAY_D_CM      = 30.0f;   // profundidade
static const float TRAY_MASS_KG   = 1.2f;    // MDF 15 mm, 30x40 cm
static const float CELL_RATING_KG = 50.0f;   // por celula

// === Valores em vigor ======================================================
// Comecam nos valores QUE ESTAO NO PROJETO HOJE, de proposito: rodar a bancada
// sem caracterizar reproduz a falha real, em vez de esconde-la.
//
// Nota: firmware/ nao tem caminho de peso nenhum. Os 10 g abaixo vem do
// wokwi/sketch.ino antigo, que e o unico criterio de estabilidade que o
// projeto tem escrito em algum lugar. Omitir o campo tambem nao salva: o
// backend trata weight_stable ausente como estavel.
static double toleranceG    = 75.0;   // products.tolerance_g do V007
static double stableWindowG = 10.0;   // unico criterio existente: wokwi/sketch.ino
static bool   characterized = false;

// === Ruido das celulas =====================================================
// 4 celulas de 50 kg = plataforma de 200 kg. Erro especificado de 0,2% do
// fundo de escala = +/- 400 g por amostra. E o que o Wokwi nao simula e o que
// decide se o projeto funciona.
static bool  noiseEnabled = true;
static float noiseSigmaG  = 400.0f;

static const int SAMPLES_PER_READING = 10;   // media de 10 amostras por leitura
static const int TARE_SAMPLES        = 40;   // a tara entra em toda leitura futura
static const int CHAR_READINGS       = 60;   // amostra da caracterizacao
static const int STABILITY_HISTORY   = 4;    // leituras comparadas entre si
static const unsigned long READING_MS = 2000;

// === Estado ================================================================
static HX711  scale;
static double tareG = 0.0;
static double history[STABILITY_HISTORY];
static int    historyCount = 0;
static int    currentQty = 0;
static bool   hasCurrentQty = false;
static bool   previousSuspect = false;

#if ENABLE_MQTT
static const char* WIFI_SSID = "Wokwi-GUEST";
static const char* WIFI_PASS = "";
static const char* MQTT_HOST = "broker.emqx.io";
static const int   MQTT_PORT = 1883;
static const char* DEVICE_ID = "wokwi-shelf-001";

static WiFiClient   wifiClient;
static PubSubClient mqtt(wifiClient);
static char sensorTopic[64];
static char statusTopic[64];
static bool mqttUsable = false;
#endif

// ===========================================================================
// Espelho fiel de ShelfCalculator.compute / nextQty
//
// A regra do backend roda tambem aqui na borda, para que o Serial mostre a
// decisao que o backend VAI tomar sem precisar do backend no ar. Qualquer
// divergencia entre estas funcoes e ShelfCalculator.java e bug.
// ===========================================================================
struct ShelfResult {
  double rawUnits;
  int    roundedQty;
  double confidence;
  bool   suspect;
};

ShelfResult computeShelf(double weightG) {
  double netG = weightG - tareG;

  if (netG < -toleranceG) {
    // Abaixo da tara: a bandeja foi levantada. Nunca reportar estoque negativo.
    ShelfResult below = { 0.0, 0, 0.0, true };
    return below;
  }
  if (netG < 0.0) netG = 0.0;

  double rawUnits      = netG / UNIT_WEIGHT_G;
  int    roundedQty    = (int) lround(rawUnits);
  double residualUnits = fabs(rawUnits - roundedQty);
  double confidence    = fmax(0.0, 1.0 - 2.0 * residualUnits);
  bool   suspect       = residualUnits * UNIT_WEIGHT_G > toleranceG;

  ShelfResult r = { rawUnits, roundedQty, confidence, suspect };
  return r;
}

int computeNextQty(double rawUnits) {
  int rounded = (int) lround(rawUnits);
  if (rounded < 0) rounded = 0;
  if (!hasCurrentQty) return rounded;
  if (fabs(rawUnits - currentQty) < DEADBAND_UNITS) return currentQty;
  return rounded;
}

// ===========================================================================
// Aquisicao
// ===========================================================================

// Ruido gaussiano: a soma de 3 uniformes em [-1,1] tem variancia 3 x (1/3) = 1,
// portanto desvio padrao exatamente 1. Multiplicar por sigma da o desvio
// desejado sem precisar de Box-Muller.
float noiseG() {
  if (!noiseEnabled) return 0.0f;
  float u = 0.0f;
  for (int i = 0; i < 3; i++) {
    u += (float) random(-1000, 1001) / 1000.0f;
  }
  return u * noiseSigmaG;
}

// Uma leitura = media de N amostras. A media divide o desvio por sqrt(N).
double readG(int samples) {
  double acc = 0.0;
  for (int i = 0; i < samples; i++) {
    acc += (double) scale.get_units(1) + noiseG();
  }
  return acc / samples;
}

double readG() {
  return readG(SAMPLES_PER_READING);
}

// Estavel = as ultimas STABILITY_HISTORY leituras cabem dentro da janela.
bool pushAndCheckStable(double weightG, double* spreadOut) {
  if (historyCount < STABILITY_HISTORY) {
    history[historyCount++] = weightG;
  } else {
    for (int i = 1; i < STABILITY_HISTORY; i++) history[i - 1] = history[i];
    history[STABILITY_HISTORY - 1] = weightG;
  }

  if (historyCount < STABILITY_HISTORY) {
    *spreadOut = NAN;
    return false;
  }

  double lo = history[0];
  double hi = history[0];
  for (int i = 1; i < STABILITY_HISTORY; i++) {
    if (history[i] < lo) lo = history[i];
    if (history[i] > hi) hi = history[i];
  }
  *spreadOut = hi - lo;
  return (hi - lo) <= stableWindowG;
}

void doTare() {
  Serial.println("\n[TARA] medindo com a bandeja vazia...");
  tareG = readG(TARE_SAMPLES);
  historyCount = 0;
  hasCurrentQty = false;
  currentQty = 0;
  Serial.printf("[TARA] tare_g = %.1f g gravada (%d amostras)\n\n", tareG, TARE_SAMPLES);
}

// ===========================================================================
// Caracterizacao - o motivo desta bancada existir
//
// Mede o ruido do conjunto MONTADO E PARADO e deriva dele os dois numeros que
// hoje sao chute. E o passo 4 da secao Calibracao do P2, automatizado.
// ===========================================================================

// Arredonda para cima num degrau legivel, para o numero recomendado nao sair
// com precisao falsa (um "tolerance_g = 508,3" sugere uma exatidao que a
// medicao nao tem).
double roundUpTo(double v, double step) {
  return ceil(v / step) * step;
}

void characterize() {
  Serial.println("\n=== CARACTERIZACAO =============================================");
  Serial.printf("Deixe a bandeja CARREGADA E PARADA. Coletando %d leituras...\n", CHAR_READINGS);

  double sum = 0.0, sumSq = 0.0;
  double lo = 1e12, hi = -1e12;

  for (int i = 0; i < CHAR_READINGS; i++) {
    double g = readG();
    sum += g;
    sumSq += g * g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
    if ((i + 1) % 15 == 0) Serial.printf("  %d/%d\n", i + 1, CHAR_READINGS);
  }

  double mean = sum / CHAR_READINGS;
  double var  = (sumSq / CHAR_READINGS) - (mean * mean);
  if (var < 0.0) var = 0.0;                        // guarda contra erro numerico
  double sd   = sqrt(var * CHAR_READINGS / (CHAR_READINGS - 1.0));  // desvio amostral
  double p2p  = hi - lo;

  // Um sigma estimado de N leituras tem incerteza relativa de 1/sqrt(2(N-1)).
  // Com 60 leituras isso e ~9%, e o intervalo de 95% e +/- 18%. Derivar os
  // limites do sigma MEDIDO daria numeros apertados demais em metade das
  // calibracoes; derivar do LIMITE SUPERIOR e a escolha conservadora e faz a
  // recomendacao parar de depender da sorte da amostra.
  double relErr  = 1.0 / sqrt(2.0 * (CHAR_READINGS - 1.0));
  double sdUpper = sd * (1.0 + 1.96 * relErr);

  Serial.println("\n-- Medido ------------------------------------------------------");
  Serial.printf("  media .................. %.1f g\n", mean);
  Serial.printf("  desvio padrao (sigma) .. %.1f g  (+/- %.0f%% com %d leituras)\n",
                sd, 100.0 * 1.96 * relErr, CHAR_READINGS);
  Serial.printf("  sigma, limite 95%% ...... %.1f g  <- e deste que sai a recomendacao\n", sdUpper);
  Serial.printf("  pico a pico ............ %.1f g  (min %.1f / max %.1f)\n", p2p, lo, hi);

  // -- Derivacao ---------------------------------------------------
  //
  // tolerance_g = 4 sigma.
  //   O flag `suspect` existe para pegar bandeja levantada e pacote fora do
  //   degrau. Se o ruido normal ja o dispara, ele perde a funcao e o P3 passa
  //   a suprimir alerta legitimo. A 4 sigma, ~0,006% das leituras viram
  //   suspeitas por ruido puro - o flag fica livre para o que importa.
  //
  // janela de estabilidade = 3,5 sigma.
  //   Para 4 amostras normais, a amplitude tem media 2,06 sigma e desvio
  //   0,88 sigma (constantes d2/d3 de controle estatistico). 3,5 sigma e
  //   media + 1,65 desvios, cobrindo ~95% das janelas. Apertar mais nao
  //   melhora a exatidao: so faz processWeight() descartar leitura boa.
  double newTolerance = roundUpTo(4.0 * sdUpper, 25.0);
  double newWindow    = roundUpTo(3.5 * sdUpper, 25.0);

  // Piso: com ruido desligado o desvio e zero e os dois derivariam zero, o que
  // marcaria tudo como suspeito por erro de arredondamento do proprio ADC.
  if (newTolerance < 25.0) newTolerance = 25.0;
  if (newWindow    < 25.0) newWindow    = 25.0;

  Serial.println("\n-- Derivado ----------------------------------------------------");
  Serial.printf("  tolerance_g ............ %.0f g   (4,0 x sigma_95)\n", newTolerance);
  Serial.printf("  janela de estabilidade . %.0f g   (3,5 x sigma_95)\n", newWindow);

  Serial.println("\n-- Confira antes de aplicar ------------------------------------");
  Serial.printf("  degrau de 1 pacote ..... %.0f g\n", UNIT_WEIGHT_G);
  Serial.printf("  tolerancia / degrau .... %.1f%%\n", 100.0 * newTolerance / UNIT_WEIGHT_G);
  if (newTolerance > UNIT_WEIGHT_G * 0.4) {
    Serial.println("  *** RUIM: a tolerancia passa de 40% do degrau. Nesta faixa a");
    Serial.println("      contagem comeca a confundir pacote com ruido. Reveja a");
    Serial.println("      montagem (bandeja mole, cabo tensionado, celula sem folga)");
    Serial.println("      antes de aceitar estes numeros.");
  } else {
    Serial.println("  OK: folga confortavel entre ruido e degrau de um pacote.");
  }

  Serial.println("\n-- Para gravar no projeto --------------------------------------");
  Serial.printf("  UPDATE products SET tolerance_g = %.0f WHERE sku = '%s';\n",
                newTolerance, PRODUCT_SKU);
  Serial.printf("  firmware: janela de estabilidade = %.0f g\n", newWindow);
  Serial.println("================================================================\n");

  toleranceG    = newTolerance;
  stableWindowG = newWindow;
  characterized = true;
  historyCount  = 0;
}

// ===========================================================================
// Analise dos quatro cantos
//
// ANALISE, nao medicao: o HX711 le a soma e so a soma. O calculo abaixo mostra
// como essa soma se reparte, que e o que justifica a decisao do P2 de usar
// quatro celulas em vez de uma barra sob uma bandeja grande.
//
// Placa rigida sobre quatro apoios de mesma rigidez: uma carga pontual em
// (fx, fy) se reparte bilinearmente entre os cantos. A soma e invariante - e
// esse e exatamente o ponto.
// ===========================================================================
struct LoadSpot { const char* name; float fx; float fy; };

static const LoadSpot SPOTS[] = {
  { "centro da bandeja",       0.50f, 0.50f },
  { "encostado na borda",      0.50f, 0.93f },
  { "empilhado num canto",     0.90f, 0.92f },
};
static const int SPOT_COUNT = sizeof(SPOTS) / sizeof(SPOTS[0]);
static int spotIndex = 0;

void reportCorners(double netG) {
  const LoadSpot& s = SPOTS[spotIndex];
  float m = (float) (netG / 1000.0);          // carga do produto, em kg
  if (m < 0.0f) m = 0.0f;

  // Carga pontual repartida bilinearmente + a bandeja, que e uniforme.
  float tray = TRAY_MASS_KG / 4.0f;
  float c00 = m * (1 - s.fx) * (1 - s.fy) + tray;
  float c10 = m * s.fx       * (1 - s.fy) + tray;
  float c01 = m * (1 - s.fx) * s.fy       + tray;
  float c11 = m * s.fx       * s.fy       + tray;

  float worst = c00;
  if (c10 > worst) worst = c10;
  if (c01 > worst) worst = c01;
  if (c11 > worst) worst = c11;

  Serial.printf("\n[CANTOS] (analise, nao medicao) %.1f kg em \"%s\" - bandeja %.0fx%.0f cm\n",
                m, s.name, TRAY_W_CM, TRAY_D_CM);
  Serial.printf("         esq-tras %5.1f kg | dir-tras %5.1f kg\n", c00, c10);
  Serial.printf("         esq-frente %5.1f kg | dir-frente %5.1f kg\n", c01, c11);
  Serial.printf("         soma = %.1f kg (%.1f de produto + %.1f da bandeja) - invariante\n"
                "         com a posicao. E exatamente o motivo de serem 4 celulas.\n",
                c00 + c10 + c01 + c11, m, TRAY_MASS_KG);
  Serial.printf("         pior canto: %.1f kg de %.0f kg (%.0f%% da capacidade da celula)%s\n\n",
                worst, CELL_RATING_KG, 100.0f * worst / CELL_RATING_KG,
                worst > CELL_RATING_KG ? "  *** ACIMA DO LIMITE ***" : "");
}

// ===========================================================================
// Interface serial
// ===========================================================================
void printValues() {
  Serial.printf("[VALORES] tolerance_g=%.0f | janela=%.0f g | ruido=%s (sigma=%.0f g) | %s\n",
                toleranceG, stableWindowG,
                noiseEnabled ? "ON" : "OFF", noiseSigmaG,
                characterized ? "CARACTERIZADO" : "NAO CARACTERIZADO (valores do V007)");
}

void printHelp() {
  Serial.println("t=tarar  c=caracterizar  p=posicao da carga  n=ruido  v=valores  ?=ajuda");
}

void handleSerial() {
  if (!Serial.available()) return;
  char c = Serial.read();
  switch (c) {
    case 't': doTare(); break;
    case 'c': characterize(); break;
    case 'p':
      spotIndex = (spotIndex + 1) % SPOT_COUNT;
      reportCorners(readG() - tareG);
      break;
    case 'n':
      noiseEnabled = !noiseEnabled;
      historyCount = 0;
      printValues();
      break;
    case 'v': printValues(); break;
    case '?': printHelp(); break;
    default: break;
  }
}

// ===========================================================================
// MQTT
// ===========================================================================
#if ENABLE_MQTT
String isoTimestamp() {
  struct tm t;
  if (!getLocalTime(&t)) return "1970-01-01T00:00:00Z";
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(buf);
}

void publishStatus(const char* status) {
  if (!mqttUsable || !mqtt.connected()) return;
  StaticJsonDocument<192> doc;
  doc["device_id"]        = DEVICE_ID;
  doc["status"]           = status;
  doc["firmware_version"] = "wokwi-shelf-2.0";
  doc["timestamp"]        = isoTimestamp();
  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(statusTopic, buf);
}

void connectMqtt() {
  if (!mqttUsable || mqtt.connected()) return;
  String clientId = String("wokwi-shelf-") + String(random(0xffff), HEX);
  if (mqtt.connect(clientId.c_str())) {
    Serial.println("[MQTT] Conectado");
    publishStatus("online");
  }
}

// Payload conforme SensorPayloadDto, topico sensor/data/{device_id}.
//
// O no de prateleira publica SO o que ele mede: peso. Nao ha DHT22 nem sensor
// de corrente na lista de compras do P2, e mandar 24 C e 0 A sinteticos so para
// preencher o payload encheria sensor_data de linha sem significado.
//
// Isso depende do backend tolerar grandeza ausente. Ele passou a tolerar em
// SensorService.insertIfPresent; antes disso, omitir temperature estourava
// NullPointerException e levava junto a leitura de peso.
void publishReading(double weightG, bool stable, const ShelfResult& r) {
  if (!mqttUsable || !mqtt.connected()) return;

  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["timestamp"] = isoTimestamp();

  JsonObject sensors = doc.createNestedObject("sensors");

  JsonObject wgtObj = sensors.createNestedObject("weight");
  wgtObj["value"] = round(weightG) / 1000.0;   // kg com 3 casas
  wgtObj["unit"]  = "kg";
  sensors["weight_stable"] = stable;

  JsonObject inf = doc.createNestedObject("inference");
  inf["classification"] = r.suspect ? "anomaly" : "normal";
  inf["anomaly_score"]  = round((1.0 - r.confidence) * 1000) / 1000.0;
  inf["model_version"]  = "wokwi-shelf-v2";

  char buf[512];
  serializeJson(doc, buf);
  mqtt.publish(sensorTopic, buf);
}
#endif

// ===========================================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(LED_OK, OUTPUT);
  pinMode(LED_SUSPECT, OUTPUT);
  pinMode(BTN_TARE, INPUT_PULLUP);
  digitalWrite(LED_OK, LOW);
  digitalWrite(LED_SUSPECT, LOW);

  scale.begin(HX711_DT, HX711_SCK);
  scale.set_scale(SIM_COUNTS_PER_GRAM);   // get_units() devolve gramas
  scale.set_offset(0);                    // a tara e nossa, igual ao backend

  Serial.println("\n=== Bancada da balanca de prateleira - P2 / PJI610 ===");
  Serial.printf("Produto %s (%s) | unit_weight_g=%.0f | min_qty=%d\n",
                PRODUCT_NAME, PRODUCT_SKU, UNIT_WEIGHT_G, MIN_QTY);
  printValues();
  Serial.println("Sem caracterizar, esta bancada roda com os numeros que estao no");
  Serial.println("projeto hoje - e eles nao funcionam. Rode 'c' para derivar os certos.");
  printHelp();
  Serial.println();

#if ENABLE_MQTT
  snprintf(sensorTopic, sizeof(sensorTopic), "sensor/data/%s",   DEVICE_ID);
  snprintf(statusTopic, sizeof(statusTopic), "device/status/%s", DEVICE_ID);

  // Timeout: a bancada tem que rodar sem rede. Um while infinito aqui impede
  // ate de ler a celula, que e o objetivo do projeto.
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long deadline = millis() + 10000;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) delay(250);

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Conectado, IP %s\n", WiFi.localIP().toString().c_str());
    configTime(0, 0, "pool.ntp.org");
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setBufferSize(768);
    mqttUsable = true;
  } else {
    Serial.println("[WiFi] Sem rede - bancada local, sem MQTT");
  }
#endif
}

// ===========================================================================
static unsigned long lastReading = 0;
static bool lastButton = HIGH;

void loop() {
#if ENABLE_MQTT
  if (mqttUsable) { connectMqtt(); mqtt.loop(); }
#endif

  handleSerial();

  bool btn = digitalRead(BTN_TARE);           // borda de descida, INPUT_PULLUP
  if (lastButton == HIGH && btn == LOW) doTare();
  lastButton = btn;

  unsigned long now = millis();
  if (now - lastReading < READING_MS) return;
  lastReading = now;

  double weightG = readG();
  double spread  = NAN;
  bool   stable  = pushAndCheckStable(weightG, &spread);
  ShelfResult r  = computeShelf(weightG);

  // O backend descarta leitura instavel na primeira linha de processWeight.
  if (!stable) {
    digitalWrite(LED_OK, LOW);
    digitalWrite(LED_SUSPECT, LOW);
    if (isnan(spread)) {
      // Historico ainda enchendo: nao ha dispersao a reportar. Acontece no
      // boot, depois de tarar e depois de caracterizar.
      Serial.printf("peso %8.1f g | liq %8.1f g | enchendo o historico (%d/%d)\n",
                    weightG, weightG - tareG, historyCount, STABILITY_HISTORY);
    } else {
      Serial.printf("peso %8.1f g | liq %8.1f g | dispersao %6.1f g > janela %.0f g "
                    "-> INSTAVEL, backend descarta%s\n",
                    weightG, weightG - tareG, spread, stableWindowG,
                    characterized ? "" : "  (rode 'c')");
    }
    return;
  }

  int  nextQty     = computeNextQty(r.rawUnits);
  bool picked      = hasCurrentQty && nextQty < currentQty && !r.suspect;
  int  pickedUnits = picked ? (currentQty - nextQty) : 0;

  // Espelha evaluateStockAlert: alerta e transicao, nao estado. Uma leitura
  // suspeita anterior re-arma o lado "estava acima".
  bool wasAbove    = !hasCurrentQty || previousSuspect || currentQty > MIN_QTY;
  bool isAtOrBelow = nextQty <= MIN_QTY;
  bool wouldAlert  = !r.suspect && wasAbove && isAtOrBelow;

  digitalWrite(LED_OK,      r.suspect ? LOW  : HIGH);
  digitalWrite(LED_SUSPECT, r.suspect ? HIGH : LOW);

  Serial.printf("peso %8.1f g | liq %8.1f g | %5.2f un -> qty %d | "
                "resto %6.1f g vs tol %.0f g | conf %.2f | %s%s%s\n",
                weightG, weightG - tareG, r.rawUnits, nextQty,
                fabs(r.rawUnits - r.roundedQty) * UNIT_WEIGHT_G, toleranceG,
                r.confidence,
                r.suspect ? "SUSPEITA (backend ignora)" : "OK",
                picked ? " | PICK EVENT" : "",
                wouldAlert ? " | ALERTA estoque baixo" : "");

  if (picked) {
    Serial.printf("        -> pick_event: %s x%d (%.1f kg)\n",
                  PRODUCT_NAME, pickedUnits, pickedUnits * UNIT_WEIGHT_G / 1000.0);
  }

  // O backend persiste a contagem mesmo em leitura suspeita: o peso absoluto
  // continua sendo a fonte da verdade. So o pick event e o alerta sao barrados.
  previousSuspect = r.suspect;
  currentQty      = nextQty;
  hasCurrentQty   = true;

#if ENABLE_MQTT
  publishReading(weightG, stable, r);
  static unsigned long lastStatus = 0;
  if (now - lastStatus > 30000) { publishStatus("online"); lastStatus = now; }
#endif
}
