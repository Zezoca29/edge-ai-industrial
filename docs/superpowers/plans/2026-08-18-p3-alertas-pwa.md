# P3 — Alertas de Ruptura e PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a contagem de estoque do P1 virar aviso no celular do comerciante, e tornar o dashboard instalável como aplicativo.

**Architecture:** Alerta é transição, não estado: nasce quando a quantidade cruza `min_qty` para baixo e se resolve sozinho quando volta a subir. A regra de ruptura roda no `ShelfService`, onde a transição exata já está em mãos; a regra de sensor mudo roda num scheduler, porque ausência de evento não se anuncia. Duplicata é impedida por índice único parcial no PostgreSQL, não por lógica de serviço. O envio de push sai da transação por evento `AFTER_COMMIT` assíncrono, de modo que o alerta persista mesmo quando a notificação falha.

**Tech Stack:** Java 21, Spring Boot 3.3 (Data JPA, Security, Scheduling, Async), PostgreSQL 16 + TimescaleDB, JUnit 5 + Mockito + Testcontainers, biblioteca `nl.martijndwars:web-push`, Next.js 15 + React 19 + TypeScript + Tailwind 3, Service Worker e Web Push API.

**Spec:** `docs/superpowers/specs/2026-08-18-p3-alertas-pwa-design.md`

## Global Constraints

- Java 21, Spring Boot 3.3. Node 20+, Next.js 15.
- **Rode build e testes dentro do módulo, nunca na raiz.** Backend: `cd backend`, depois `.\gradlew.bat test`. Frontend: `cd frontend`, depois `npm run build`.
- Shell primário é PowerShell no Windows. `<` para redirecionar arquivo **não funciona** — use `Get-Content arquivo | comando`.
- PostgreSQL do Docker na porta **5433**, container `edgeai-postgres`, banco e usuário `edgeai`.
- Migrations montadas em `/docker-entrypoint-initdb.d` só executam em volume vazio; em banco existente, aplique manualmente.
- Chaves estrangeiras são colunas `UUID` simples, nunca `@ManyToOne`.
- Todo endpoint é escopado por `CurrentStore.id()`. Recurso de outra loja se comporta como **não encontrado**.
- `alert_type` só assume `stock_low` (severidade `high`) e `device_silent` (severidade `medium`).
- A mensagem do alerta é factual e **não estima dinheiro**: `"Arroz 5 kg: restam 4 unidades, mínimo 5"`.
- **Nenhuma chave VAPID entra no repositório.** Só variáveis de ambiente com valor vazio como padrão.
- Código, identificadores e mensagens de commit em inglês. Texto de interface e mensagens de alerta em pt-BR.
- Todo commit deixa `.\gradlew.bat test` verde.
- Não commite `backend/bin/` nem `firmware/simulator/__pycache__/`.

---

### Task 1: Migration V008 — colunas de alerta, índices parciais e inscrições

**Files:**
- Create: `database/migrations/V008__alerts_and_push.sql`

**Interfaces:**
- Consumes: nada.
- Produces: colunas `alerts.store_id`, `alerts.shelf_slot_id`, `alerts.resolved_at`; índices `idx_alerts_open_slot` e `idx_alerts_open_device`; tabela `push_subscriptions`.

- [ ] **Step 1: Write the migration**

Crie `database/migrations/V008__alerts_and_push.sql`:

```sql
-- V008 - Alerts get a store, a slot and a resolution; push subscriptions arrive.
--
-- The alerts table has existed since PJI510 and never received a row. It is
-- now the record of two rules: a shelf that crossed below its minimum, and a
-- device that stopped reporting.

-- NOT NULL é seguro: a tabela nunca recebeu uma linha desde o PJI510.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS store_id      UUID NOT NULL REFERENCES stores(id);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS shelf_slot_id UUID REFERENCES shelf_slots(id);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at   TIMESTAMPTZ;

-- Duplicate alerts are impossible, not improbable: a second open alert of the
-- same type for the same shelf is refused by the database. Two indexes because
-- the two rules key differently - stock is per shelf, silence is per device.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_open_slot
    ON alerts (shelf_slot_id, alert_type)
    WHERE resolved_at IS NULL AND shelf_slot_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_open_device
    ON alerts (device_id, alert_type)
    WHERE resolved_at IS NULL AND shelf_slot_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_store_open
    ON alerts (store_id, resolved_at, acknowledged, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    store_id        UUID NOT NULL REFERENCES stores(id),
    endpoint        TEXT NOT NULL UNIQUE,
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,
    failure_count   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_success_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_store ON push_subscriptions (store_id);
```

- [ ] **Step 2: Apply to the running database**

```powershell
Get-Content database/migrations/V008__alerts_and_push.sql | docker exec -i edgeai-postgres psql -U edgeai -d edgeai
```

- [ ] **Step 3: Verify the schema landed**

```powershell
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "\d alerts"
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "\d push_subscriptions"
```

Esperado: `alerts` com `store_id`, `shelf_slot_id`, `resolved_at` e os dois índices únicos parciais listados; `push_subscriptions` com 9 colunas.

- [ ] **Step 4: Prove the partial index actually refuses a duplicate**

```powershell
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "INSERT INTO alerts (device_id, store_id, shelf_slot_id, alert_type, severity, message) SELECT s.device_id, '11111111-1111-1111-1111-111111111111', s.id, 'stock_low', 'high', 'teste' FROM shelf_slots s LIMIT 1;"
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "INSERT INTO alerts (device_id, store_id, shelf_slot_id, alert_type, severity, message) SELECT s.device_id, '11111111-1111-1111-1111-111111111111', s.id, 'stock_low', 'high', 'teste 2' FROM shelf_slots s LIMIT 1;"
```

Esperado: o primeiro `INSERT 0 1`, o segundo falha com `duplicate key value violates unique constraint "idx_alerts_open_slot"`. Limpe depois:

```powershell
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "DELETE FROM alerts WHERE message LIKE 'teste%';"
```

- [ ] **Step 5: Commit**

```bash
git add database/migrations/V008__alerts_and_push.sql
git commit -m "feat(db): add alert lifecycle columns, partial dedup indexes and push subscriptions"
```

---

### Task 2: Alert, AlertRepository e AlertService

O núcleo. Abrir um alerta é idempotente por construção.

**Files:**
- Create: `backend/src/main/java/com/edgeai/industrial/domain/Alert.java`
- Create: `backend/src/main/java/com/edgeai/industrial/repository/AlertRepository.java`
- Create: `backend/src/main/java/com/edgeai/industrial/service/AlertService.java`
- Create: `backend/src/main/java/com/edgeai/industrial/service/AlertOpenedEvent.java`
- Test: `backend/src/test/java/com/edgeai/industrial/service/AlertServiceTest.java`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `AlertService.TYPE_STOCK_LOW` = `"stock_low"`, `AlertService.TYPE_DEVICE_SILENT` = `"device_silent"`
  - `Optional<Alert> open(UUID storeId, UUID deviceId, UUID shelfSlotId, String type, String severity, String message)`
  - `void resolveForSlot(UUID shelfSlotId, String type)`
  - `void resolveForDevice(UUID deviceId, String type)`
  - `void acknowledge(UUID alertId, UUID storeId, UUID userId)`
  - `List<Alert> list(UUID storeId, boolean onlyOpen)`
  - `AlertOpenedEvent(UUID alertId, UUID storeId, String title, String body)`

- [ ] **Step 1: Write the failing test**

Crie `backend/src/test/java/com/edgeai/industrial/service/AlertServiceTest.java`:

```java
package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.repository.AlertRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AlertServiceTest {

    @Mock private AlertRepository alertRepository;
    @Mock private ApplicationEventPublisher events;

    @InjectMocks private AlertService alertService;

    private UUID storeId;
    private UUID deviceId;
    private UUID slotId;

    @BeforeEach
    void setUp() {
        storeId = UUID.randomUUID();
        deviceId = UUID.randomUUID();
        slotId = UUID.randomUUID();
    }

    private Alert openAlert() {
        Alert a = new Alert();
        a.setId(UUID.randomUUID());
        a.setStoreId(storeId);
        a.setDeviceId(deviceId);
        a.setShelfSlotId(slotId);
        a.setAlertType(AlertService.TYPE_STOCK_LOW);
        return a;
    }

    @Test
    void openPersistsTheAlertAndPublishesAnEvent() {
        when(alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(slotId, AlertService.TYPE_STOCK_LOW))
                .thenReturn(Optional.empty());
        when(alertRepository.save(any(Alert.class))).thenAnswer(inv -> {
            Alert a = inv.getArgument(0);
            a.setId(UUID.randomUUID());
            return a;
        });

        Optional<Alert> result = alertService.open(storeId, deviceId, slotId,
                AlertService.TYPE_STOCK_LOW, "high", "Arroz 5 kg: restam 4 unidades, minimo 5");

        assertTrue(result.isPresent());
        verify(events).publishEvent(any(AlertOpenedEvent.class));
    }

    @Test
    void openIsANoOpWhenAnAlertOfTheSameTypeIsAlreadyOpenForTheSlot() {
        when(alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(slotId, AlertService.TYPE_STOCK_LOW))
                .thenReturn(Optional.of(openAlert()));

        Optional<Alert> result = alertService.open(storeId, deviceId, slotId,
                AlertService.TYPE_STOCK_LOW, "high", "outra mensagem");

        assertTrue(result.isEmpty(), "o alerta ja aberto nao pode virar um segundo aviso");
        verify(alertRepository, never()).save(any(Alert.class));
        verifyNoInteractions(events);
    }

    @Test
    void openWithoutASlotDeduplicatesByDevice() {
        when(alertRepository.findByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNull(
                deviceId, AlertService.TYPE_DEVICE_SILENT))
                .thenReturn(Optional.empty());
        when(alertRepository.save(any(Alert.class))).thenAnswer(inv -> inv.getArgument(0));

        Optional<Alert> result = alertService.open(storeId, deviceId, null,
                AlertService.TYPE_DEVICE_SILENT, "medium", "Sensor sem sinal ha 10 minutos");

        assertTrue(result.isPresent());
    }

    @Test
    void resolveForSlotStampsResolvedAt() {
        Alert alert = openAlert();
        when(alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(slotId, AlertService.TYPE_STOCK_LOW))
                .thenReturn(Optional.of(alert));

        alertService.resolveForSlot(slotId, AlertService.TYPE_STOCK_LOW);

        ArgumentCaptor<Alert> captor = ArgumentCaptor.forClass(Alert.class);
        verify(alertRepository).save(captor.capture());
        assertNotNull(captor.getValue().getResolvedAt());
    }

    @Test
    void resolveIsSilentWhenNothingIsOpen() {
        when(alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(slotId, AlertService.TYPE_STOCK_LOW))
                .thenReturn(Optional.empty());

        alertService.resolveForSlot(slotId, AlertService.TYPE_STOCK_LOW);

        verify(alertRepository, never()).save(any(Alert.class));
    }

    @Test
    void acknowledgeMarksSeenWithoutResolving() {
        Alert alert = openAlert();
        UUID userId = UUID.randomUUID();
        when(alertRepository.findByIdAndStoreId(alert.getId(), storeId)).thenReturn(Optional.of(alert));

        alertService.acknowledge(alert.getId(), storeId, userId);

        ArgumentCaptor<Alert> captor = ArgumentCaptor.forClass(Alert.class);
        verify(alertRepository).save(captor.capture());
        assertTrue(captor.getValue().getAcknowledged());
        assertEquals(userId, captor.getValue().getAcknowledgedBy());
        assertNotNull(captor.getValue().getAcknowledgedAt());
        assertNull(captor.getValue().getResolvedAt(), "visto nao e o mesmo que resolvido");
    }

    @Test
    void acknowledgeOnAnAlertOfAnotherStoreIsRefused() {
        UUID otherId = UUID.randomUUID();
        when(alertRepository.findByIdAndStoreId(otherId, storeId)).thenReturn(Optional.empty());

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> alertService.acknowledge(otherId, storeId, UUID.randomUUID()));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.service.AlertServiceTest"
```

Esperado: FAIL na compilação — `cannot find symbol: class Alert`.

- [ ] **Step 3: Write the entity**

Crie `backend/src/main/java/com/edgeai/industrial/domain/Alert.java`:

```java
package com.edgeai.industrial.domain;

import jakarta.persistence.*;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@Entity
@Table(name = "alerts")
public class Alert {

    @EqualsAndHashCode.Include
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "store_id", nullable = false)
    private UUID storeId;

    @Column(name = "device_id", nullable = false)
    private UUID deviceId;

    /** Null for device-level alerts, which key on the device instead. */
    @Column(name = "shelf_slot_id")
    private UUID shelfSlotId;

    @Column(name = "alert_type", nullable = false, length = 50)
    private String alertType;

    @Column(nullable = false, length = 20)
    private String severity;

    @Column(nullable = false)
    private String message;

    /** "I saw this" — distinct from resolved, which means the situation ended. */
    @Column(nullable = false)
    private Boolean acknowledged = false;

    @Column(name = "acknowledged_by")
    private UUID acknowledgedBy;

    @Column(name = "acknowledged_at")
    private OffsetDateTime acknowledgedAt;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (this.createdAt == null) this.createdAt = OffsetDateTime.now();
    }
}
```

- [ ] **Step 4: Write the repository**

Crie `backend/src/main/java/com/edgeai/industrial/repository/AlertRepository.java`:

```java
package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AlertRepository extends JpaRepository<Alert, UUID> {

    Optional<Alert> findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(UUID shelfSlotId, String alertType);

    Optional<Alert> findByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNull(
            UUID deviceId, String alertType);

    Optional<Alert> findByIdAndStoreId(UUID id, UUID storeId);

    List<Alert> findByStoreIdOrderByCreatedAtDesc(UUID storeId);

    List<Alert> findByStoreIdAndResolvedAtIsNullAndAcknowledgedFalseOrderByCreatedAtDesc(UUID storeId);

    long countByStoreIdAndResolvedAtIsNullAndAcknowledgedFalse(UUID storeId);
}
```

- [ ] **Step 5: Write the event**

Crie `backend/src/main/java/com/edgeai/industrial/service/AlertOpenedEvent.java`:

```java
package com.edgeai.industrial.service;

import java.util.UUID;

/** Published after an alert row is committed, so notification never blocks ingestion. */
public record AlertOpenedEvent(UUID alertId, UUID storeId, String title, String body) {
}
```

- [ ] **Step 6: Write the service**

Crie `backend/src/main/java/com/edgeai/industrial/service/AlertService.java`:

```java
package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.repository.AlertRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {

    public static final String TYPE_STOCK_LOW = "stock_low";
    public static final String TYPE_DEVICE_SILENT = "device_silent";

    private final AlertRepository alertRepository;
    private final ApplicationEventPublisher events;

    /**
     * Opens an alert unless one of the same type is already open for the same
     * target.
     *
     * <p>Runs in its own transaction on purpose. The partial unique index is the
     * last-resort guarantee against a duplicate, and a violation of it poisons
     * whatever transaction it happens in — a lesson from the shelf slot race in
     * P1. Keeping the insert isolated means a caller mid-ingestion loses at most
     * the alert, never the reading it was processing.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<Alert> open(UUID storeId, UUID deviceId, UUID shelfSlotId,
                                String type, String severity, String message) {
        Optional<Alert> existing = shelfSlotId != null
                ? alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(shelfSlotId, type)
                : alertRepository.findByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNull(deviceId, type);

        if (existing.isPresent()) {
            return Optional.empty();
        }

        Alert alert = new Alert();
        alert.setStoreId(storeId);
        alert.setDeviceId(deviceId);
        alert.setShelfSlotId(shelfSlotId);
        alert.setAlertType(type);
        alert.setSeverity(severity);
        alert.setMessage(message);

        Alert saved = alertRepository.save(alert);
        events.publishEvent(new AlertOpenedEvent(saved.getId(), storeId, titleFor(type), message));
        return Optional.of(saved);
    }

    @Transactional
    public void resolveForSlot(UUID shelfSlotId, String type) {
        alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(shelfSlotId, type)
                .ifPresent(this::stampResolved);
    }

    @Transactional
    public void resolveForDevice(UUID deviceId, String type) {
        alertRepository.findByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNull(deviceId, type)
                .ifPresent(this::stampResolved);
    }

    @Transactional
    public void acknowledge(UUID alertId, UUID storeId, UUID userId) {
        Alert alert = alertRepository.findByIdAndStoreId(alertId, storeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Alerta nao encontrado"));
        alert.setAcknowledged(true);
        alert.setAcknowledgedBy(userId);
        alert.setAcknowledgedAt(OffsetDateTime.now());
        alertRepository.save(alert);
    }

    public List<Alert> list(UUID storeId, boolean onlyOpen) {
        return onlyOpen
                ? alertRepository.findByStoreIdAndResolvedAtIsNullAndAcknowledgedFalseOrderByCreatedAtDesc(storeId)
                : alertRepository.findByStoreIdOrderByCreatedAtDesc(storeId);
    }

    public long countOpen(UUID storeId) {
        return alertRepository.countByStoreIdAndResolvedAtIsNullAndAcknowledgedFalse(storeId);
    }

    private void stampResolved(Alert alert) {
        alert.setResolvedAt(OffsetDateTime.now());
        alertRepository.save(alert);
    }

    private static String titleFor(String type) {
        return TYPE_DEVICE_SILENT.equals(type) ? "Sensor sem sinal" : "Estoque baixo";
    }
}
```

- [ ] **Step 7: Run the full suite**

```powershell
cd backend
.\gradlew.bat test
```

Esperado: PASS, com os 7 testes novos de `AlertServiceTest`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/edgeai/industrial/domain/Alert.java backend/src/main/java/com/edgeai/industrial/repository/AlertRepository.java backend/src/main/java/com/edgeai/industrial/service/AlertService.java backend/src/main/java/com/edgeai/industrial/service/AlertOpenedEvent.java backend/src/test/java/com/edgeai/industrial/service/AlertServiceTest.java
git commit -m "feat(backend): add alert lifecycle with database-enforced deduplication"
```

---

### Task 3: Regra de ruptura dentro do ShelfService

**Files:**
- Modify: `backend/src/main/java/com/edgeai/industrial/service/ShelfService.java`
- Test: `backend/src/test/java/com/edgeai/industrial/service/ShelfServiceTest.java` (adicionar casos)

**Interfaces:**
- Consumes: `AlertService.open`, `AlertService.resolveForSlot`, `AlertService.TYPE_STOCK_LOW` (Task 2).
- Produces: nada de novo para tarefas seguintes.

- [ ] **Step 1: Write the failing tests**

Em `backend/src/test/java/com/edgeai/industrial/service/ShelfServiceTest.java`, adicione o mock e os casos. O mock novo:

```java
    @Mock private AlertService alertService;
```

E os testes, ao final da classe:

```java
    @Test
    void crossingBelowTheMinimumOpensExactlyOneStockAlert() {
        ShelfSlot s = slot(6);
        s.setMinQty(5);
        wire(s);

        shelfService.processWeight(deviceId, now, 4200.0, true);  // 4000g = 4 unidades

        verify(alertService).open(eq(storeId), eq(deviceId), eq(s.getId()),
                eq(AlertService.TYPE_STOCK_LOW), eq("high"), contains("Arroz 1kg"));
    }

    @Test
    void stayingBelowTheMinimumDoesNotOpenAnotherAlert() {
        ShelfSlot s = slot(4);
        s.setMinQty(5);
        wire(s);

        shelfService.processWeight(deviceId, now, 3200.0, true);  // 3000g = 3 unidades

        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
    }

    @Test
    void climbingBackAboveTheMinimumResolvesTheAlert() {
        ShelfSlot s = slot(4);
        s.setMinQty(5);
        wire(s);

        shelfService.processWeight(deviceId, now, 8200.0, true);  // 8000g = 8 unidades

        verify(alertService).resolveForSlot(s.getId(), AlertService.TYPE_STOCK_LOW);
        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
    }

    @Test
    void anInactiveProductNeverRaisesAStockAlert() {
        ShelfSlot s = slot(6);
        s.setMinQty(5);
        when(shelfSlotRepository.findByDeviceIdAndSlotIndex(deviceId, (short) 0))
                .thenReturn(Optional.of(s));
        Product inactive = product();
        inactive.setActive(false);
        when(productRepository.findById(productId)).thenReturn(Optional.of(inactive));
        when(deviceRepository.findById(deviceId)).thenReturn(Optional.of(device(storeId)));

        shelfService.processWeight(deviceId, now, 4200.0, true);

        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
    }
```

Se o helper `product()` do arquivo ainda não define `active`, adicione `p.setActive(true);` nele.

Adicione os imports estáticos `org.mockito.ArgumentMatchers.contains` e `org.mockito.ArgumentMatchers.eq` se ainda não existirem.

- [ ] **Step 2: Run tests to verify they fail**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.service.ShelfServiceTest"
```

Esperado: FAIL na compilação — `cannot find symbol: class AlertService` no construtor de `ShelfService`.

- [ ] **Step 3: Wire AlertService into ShelfService**

Em `backend/src/main/java/com/edgeai/industrial/service/ShelfService.java`, adicione a dependência:

```java
    private final AlertService alertService;
```

E, logo após o bloco que grava o `pick_event` (o `if (previousQty != null && nextQty < previousQty && !result.suspect())`), adicione:

```java
        evaluateStockAlert(slot, product, deviceId, previousQty, nextQty);
```

Depois adicione o método privado à classe:

```java
    /**
     * An alert is a transition, not a state. Raising one on every reading while
     * the shelf stays low is how a notification becomes noise the staff learns
     * to ignore — the failure the shopkeeper named as the one that would kill
     * his trust in the system.
     *
     * <p>The 0.6-unit deadband in {@link ShelfCalculator} already keeps the
     * count from trembling at the threshold, so no extra debounce is needed here.
     */
    private void evaluateStockAlert(ShelfSlot slot, Product product, UUID deviceId,
                                    Integer previousQty, int nextQty) {
        if (!Boolean.TRUE.equals(product.getActive())) {
            return;
        }
        int min = slot.getMinQty();

        boolean wasAbove = previousQty == null || previousQty > min;
        boolean isAtOrBelow = nextQty <= min;

        if (wasAbove && isAtOrBelow) {
            String message = String.format("%s: restam %d unidades, minimo %d",
                    product.getName(), nextQty, min);
            try {
                alertService.open(product.getStoreId(), deviceId, slot.getId(),
                        AlertService.TYPE_STOCK_LOW, "high", message);
            } catch (DataIntegrityViolationException e) {
                // The partial unique index refused a concurrent duplicate. The alert
                // already exists, which is the outcome we wanted; the reading itself
                // must not be lost over it.
                log.debug("Stock alert for slot {} already open", slot.getId());
            }
        } else if (!isAtOrBelow && previousQty != null && previousQty <= min) {
            alertService.resolveForSlot(slot.getId(), AlertService.TYPE_STOCK_LOW);
        }
    }
```

Adicione o import `org.springframework.dao.DataIntegrityViolationException`.

- [ ] **Step 4: Run the full suite**

```powershell
cd backend
.\gradlew.bat test
```

Esperado: PASS. Os testes existentes de `ShelfServiceTest` que não estubam `alertService` continuam passando porque Mockito devolve `Optional.empty()`/nada por padrão.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/edgeai/industrial/service/ShelfService.java backend/src/test/java/com/edgeai/industrial/service/ShelfServiceTest.java
git commit -m "feat(backend): raise a stock alert when the count crosses the minimum"
```

---

### Task 4: DeviceSilenceMonitor

Ausência de evento não se anuncia; alguém tem que ir olhar.

**Files:**
- Create: `backend/src/main/java/com/edgeai/industrial/service/DeviceSilenceMonitor.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/BackendApplication.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/repository/DeviceRepository.java`
- Modify: `backend/src/main/resources/application.yml`
- Test: `backend/src/test/java/com/edgeai/industrial/service/DeviceSilenceMonitorTest.java`

**Interfaces:**
- Consumes: `AlertService.open`, `AlertService.resolveForDevice`, `AlertService.TYPE_DEVICE_SILENT` (Task 2).
- Produces: `DeviceSilenceMonitor.sweep()` — público para o teste chamar sem esperar o agendador.
- Produces: `DeviceRepository.findByStoreIdIsNotNull()` → `List<Device>`.

- [ ] **Step 1: Write the failing test**

Crie `backend/src/test/java/com/edgeai/industrial/service/DeviceSilenceMonitorTest.java`:

```java
package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.repository.DeviceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DeviceSilenceMonitorTest {

    @Mock private DeviceRepository deviceRepository;
    @Mock private AlertService alertService;

    private DeviceSilenceMonitor monitor;
    private Clock clock;
    private UUID storeId;

    @BeforeEach
    void setUp() {
        // Relogio fixo: o teste avanca o tempo trocando o Clock, nunca dormindo.
        clock = Clock.fixed(Instant.parse("2026-08-18T12:00:00Z"), ZoneOffset.UTC);
        storeId = UUID.randomUUID();
        monitor = new DeviceSilenceMonitor(deviceRepository, alertService, clock, 10);
    }

    private Device device(OffsetDateTime lastSeen) {
        Device d = new Device();
        d.setId(UUID.randomUUID());
        d.setName("wokwi-shelf-001");
        d.setStoreId(storeId);
        d.setLastSeenAt(lastSeen);
        return d;
    }

    @Test
    void aDeviceSilentBeyondTheThresholdRaisesAnAlert() {
        Device d = device(OffsetDateTime.parse("2026-08-18T11:45:00Z"));  // 15 min atras
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));

        monitor.sweep();

        verify(alertService).open(eq(storeId), eq(d.getId()), isNull(),
                eq(AlertService.TYPE_DEVICE_SILENT), eq("medium"), contains("wokwi-shelf-001"));
    }

    @Test
    void aDeviceReportingWithinTheThresholdRaisesNothingAndResolves() {
        Device d = device(OffsetDateTime.parse("2026-08-18T11:58:00Z"));  // 2 min atras
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));

        monitor.sweep();

        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
        verify(alertService).resolveForDevice(d.getId(), AlertService.TYPE_DEVICE_SILENT);
    }

    @Test
    void aDeviceThatNeverReportedIsNotDeclaredSilent() {
        Device d = device(null);
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));

        monitor.sweep();

        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
    }

    @Test
    void aDeviceExactlyAtTheThresholdIsStillConsideredAlive() {
        Device d = device(OffsetDateTime.parse("2026-08-18T11:50:00Z"));  // exatamente 10 min
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));

        monitor.sweep();

        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.service.DeviceSilenceMonitorTest"
```

Esperado: FAIL na compilação — `cannot find symbol: class DeviceSilenceMonitor`.

- [ ] **Step 3: Add the repository finder**

Em `backend/src/main/java/com/edgeai/industrial/repository/DeviceRepository.java`, adicione:

```java
    List<Device> findByStoreIdIsNotNull();
```

Adicione o import `java.util.List` se ainda não existir.

- [ ] **Step 4: Write the monitor**

Crie `backend/src/main/java/com/edgeai/industrial/service/DeviceSilenceMonitor.java`:

```java
package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.repository.DeviceRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;

/**
 * Raises an alert for a device that stopped reporting.
 *
 * <p>Silence is the one failure the ingestion path cannot notice: when nothing
 * arrives, nothing runs. Without this sweep the system would go quiet after a
 * sensor died, and quiet reads as "everything is fine".
 */
@Slf4j
@Component
public class DeviceSilenceMonitor {

    private final DeviceRepository deviceRepository;
    private final AlertService alertService;
    private final Clock clock;
    private final long silenceMinutes;

    public DeviceSilenceMonitor(DeviceRepository deviceRepository,
                                AlertService alertService,
                                Clock clock,
                                @Value("${alerts.device-silence-minutes:10}") long silenceMinutes) {
        this.deviceRepository = deviceRepository;
        this.alertService = alertService;
        this.clock = clock;
        this.silenceMinutes = silenceMinutes;
    }

    /** fixedDelay, not fixedRate: a slow sweep must not stack on the next one. */
    @Scheduled(fixedDelay = 60_000L, initialDelay = 60_000L)
    public void sweep() {
        OffsetDateTime deadline = OffsetDateTime.now(clock).minus(Duration.ofMinutes(silenceMinutes));

        for (Device device : deviceRepository.findByStoreIdIsNotNull()) {
            OffsetDateTime lastSeen = device.getLastSeenAt();
            if (lastSeen == null) {
                // Never reported at all: registered but never installed. Alerting on
                // it would fire for every device someone created and left in a box.
                continue;
            }

            if (lastSeen.isBefore(deadline)) {
                String message = String.format("%s: sem sinal ha mais de %d minutos",
                        device.getName(), silenceMinutes);
                try {
                    alertService.open(device.getStoreId(), device.getId(), null,
                            AlertService.TYPE_DEVICE_SILENT, "medium", message);
                } catch (DataIntegrityViolationException e) {
                    log.debug("Silence alert for device {} already open", device.getId());
                }
            } else {
                alertService.resolveForDevice(device.getId(), AlertService.TYPE_DEVICE_SILENT);
            }
        }
    }
}
```

- [ ] **Step 5: Enable scheduling and provide a Clock bean**

Em `backend/src/main/java/com/edgeai/industrial/BackendApplication.java`, adicione as anotações e o bean:

```java
@SpringBootApplication
@EnableScheduling
@EnableAsync
public class BackendApplication {
```

E dentro da classe:

```java
    /** Injected so time-dependent rules are testable without sleeping. */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
```

Adicione os imports `org.springframework.scheduling.annotation.EnableScheduling`, `org.springframework.scheduling.annotation.EnableAsync` e `java.time.Clock`.

- [ ] **Step 6: Add the configuration property**

Em `backend/src/main/resources/application.yml`, adicione ao final:

```yaml
alerts:
  # O firmware do P2 usa deep sleep para nao precisar de fio permanente; um
  # dispositivo que acorda de 5 em 5 minutos nao pode ser dado como morto.
  device-silence-minutes: 10
```

- [ ] **Step 7: Run the full suite**

```powershell
cd backend
.\gradlew.bat test
```

Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java backend/src/main/resources/application.yml backend/src/test/java/com/edgeai/industrial/service/DeviceSilenceMonitorTest.java
git commit -m "feat(backend): alert when a device goes silent"
```

---

### Task 5: PushSender e inscrições

**Files:**
- Create: `backend/src/main/java/com/edgeai/industrial/domain/PushSubscription.java`
- Create: `backend/src/main/java/com/edgeai/industrial/repository/PushSubscriptionRepository.java`
- Create: `backend/src/main/java/com/edgeai/industrial/service/PushSender.java`
- Modify: `backend/build.gradle`
- Modify: `backend/src/main/resources/application.yml`
- Test: `backend/src/test/java/com/edgeai/industrial/service/PushSenderTest.java`

**Interfaces:**
- Consumes: `AlertOpenedEvent` (Task 2).
- Produces:
  - `PushSubscription` — `getId()`, `getUserId()`, `getStoreId()`, `getEndpoint()`, `getP256dh()`, `getAuth()`, `getFailureCount()`, `getLastSuccessAt()` e setters
  - `PushSubscriptionRepository.findByStoreId(UUID)` → `List<PushSubscription>`, `findByEndpoint(String)` → `Optional<PushSubscription>`
  - `PushSender.onAlertOpened(AlertOpenedEvent)`
  - `PushSender.deliver(PushSubscription, String payloadJson)` → `int` (código HTTP; 0 quando o push está desabilitado)

- [ ] **Step 1: Add the dependency**

Em `backend/build.gradle`, dentro do bloco `dependencies`, adicione:

```groovy
    // Web Push (VAPID). Traz BouncyCastle junto.
    implementation 'nl.martijndwars:web-push:5.1.1'
    implementation 'org.bouncycastle:bcprov-jdk18on:1.78.1'
```

Rode `.\gradlew.bat dependencies --configuration runtimeClasspath` e confirme que as duas resolvem. Se `nl.martijndwars:web-push:5.1.1` não resolver do Maven Central, **pare e reporte** — não troque por outra biblioteca sem instrução.

- [ ] **Step 2: Write the failing test**

Crie `backend/src/test/java/com/edgeai/industrial/service/PushSenderTest.java`:

```java
package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.PushSubscription;
import com.edgeai.industrial.repository.PushSubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PushSenderTest {

    @Mock private PushSubscriptionRepository subscriptionRepository;

    private UUID storeId;

    @BeforeEach
    void setUp() {
        storeId = UUID.randomUUID();
    }

    private PushSubscription subscription() {
        PushSubscription s = new PushSubscription();
        s.setId(UUID.randomUUID());
        s.setStoreId(storeId);
        s.setUserId(UUID.randomUUID());
        s.setEndpoint("https://push.example/abc");
        s.setP256dh("chave");
        s.setAuth("segredo");
        s.setFailureCount(0);
        return s;
    }

    /** Subclasse de teste: troca a entrega HTTP real por um codigo fixo. */
    private PushSender senderReturning(int status) {
        return new PushSender(subscriptionRepository, "", "", "mailto:teste@edgeai.local") {
            @Override
            protected int deliver(PushSubscription subscription, String payloadJson) {
                return status;
            }
        };
    }

    @Test
    void aGoneSubscriptionIsDeletedOnTheSpot() {
        PushSubscription sub = subscription();
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of(sub));

        senderReturning(410).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4"));

        verify(subscriptionRepository).delete(sub);
        verify(subscriptionRepository, never()).save(sub);
    }

    @Test
    void aNotFoundSubscriptionIsDeletedToo() {
        PushSubscription sub = subscription();
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of(sub));

        senderReturning(404).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4"));

        verify(subscriptionRepository).delete(sub);
    }

    @Test
    void aTransientFailureKeepsTheSubscriptionAndCountsIt() {
        PushSubscription sub = subscription();
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of(sub));

        senderReturning(500).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4"));

        ArgumentCaptor<PushSubscription> captor = ArgumentCaptor.forClass(PushSubscription.class);
        verify(subscriptionRepository).save(captor.capture());
        assertEquals(1, captor.getValue().getFailureCount());
        verify(subscriptionRepository, never()).delete(sub);
    }

    @Test
    void aSuccessfulSendStampsLastSuccessAndResetsTheCounter() {
        PushSubscription sub = subscription();
        sub.setFailureCount(3);
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of(sub));

        senderReturning(201).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4"));

        ArgumentCaptor<PushSubscription> captor = ArgumentCaptor.forClass(PushSubscription.class);
        verify(subscriptionRepository).save(captor.capture());
        assertEquals(0, captor.getValue().getFailureCount());
        assertNotNull(captor.getValue().getLastSuccessAt());
    }

    @Test
    void aStoreWithNoSubscriptionsIsNotAnError() {
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of());

        assertDoesNotThrow(() -> senderReturning(201).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4")));
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.service.PushSenderTest"
```

Esperado: FAIL na compilação — `cannot find symbol: class PushSubscription`.

- [ ] **Step 4: Write the entity and repository**

Crie `backend/src/main/java/com/edgeai/industrial/domain/PushSubscription.java`:

```java
package com.edgeai.industrial.domain;

import jakarta.persistence.*;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@Entity
@Table(name = "push_subscriptions")
public class PushSubscription {

    @EqualsAndHashCode.Include
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "store_id", nullable = false)
    private UUID storeId;

    /** Identifies the subscription at the push service, and dies with its origin. */
    @Column(nullable = false, unique = true, length = 1000)
    private String endpoint;

    @Column(nullable = false, length = 500)
    private String p256dh;

    @Column(nullable = false, length = 500)
    private String auth;

    @Column(name = "failure_count", nullable = false)
    private Integer failureCount = 0;

    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "last_success_at")
    private OffsetDateTime lastSuccessAt;

    @PrePersist
    void onCreate() {
        if (this.createdAt == null) this.createdAt = OffsetDateTime.now();
    }
}
```

Crie `backend/src/main/java/com/edgeai/industrial/repository/PushSubscriptionRepository.java`:

```java
package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.PushSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, UUID> {

    List<PushSubscription> findByStoreId(UUID storeId);

    Optional<PushSubscription> findByEndpoint(String endpoint);
}
```

- [ ] **Step 5: Write PushSender**

Crie `backend/src/main/java/com/edgeai/industrial/service/PushSender.java`:

```java
package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.PushSubscription;
import com.edgeai.industrial.repository.PushSubscriptionRepository;
import lombok.extern.slf4j.Slf4j;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.security.Security;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Delivers an opened alert to the store's registered browsers.
 *
 * <p>Runs after the alert row is committed and off the caller's thread: the
 * alert is the record, the push is only delivery. A push service that is slow
 * or down must never hold up sensor ingestion, and must never cost us the
 * alert itself.
 */
@Slf4j
@Component
public class PushSender {

    private final PushSubscriptionRepository subscriptionRepository;
    private final String publicKey;
    private final String privateKey;
    private final String subject;

    public PushSender(PushSubscriptionRepository subscriptionRepository,
                      @Value("${push.vapid.public-key:}") String publicKey,
                      @Value("${push.vapid.private-key:}") String privateKey,
                      @Value("${push.vapid.subject:mailto:admin@edgeai.local}") String subject) {
        this.subscriptionRepository = subscriptionRepository;
        this.publicKey = publicKey;
        this.privateKey = privateKey;
        this.subject = subject;
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new org.bouncycastle.jce.provider.BouncyCastleProvider());
        }
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onAlertOpened(AlertOpenedEvent event) {
        List<PushSubscription> subscriptions = subscriptionRepository.findByStoreId(event.storeId());
        if (subscriptions.isEmpty()) {
            // Not an error: this is the state before anyone has enabled alerts.
            log.debug("Store {} has no push subscriptions; alert {} recorded only",
                    event.storeId(), event.alertId());
            return;
        }

        String payload = String.format(
                "{\"title\":\"%s\",\"body\":\"%s\",\"url\":\"/dashboard/alerts\"}",
                escape(event.title()), escape(event.body()));

        for (PushSubscription subscription : subscriptions) {
            int status = deliver(subscription, payload);
            if (status == 404 || status == 410) {
                // The subscription is dead — most often because the origin changed.
                subscriptionRepository.delete(subscription);
                log.info("Removed dead push subscription {}", subscription.getId());
            } else if (status >= 200 && status < 300) {
                subscription.setFailureCount(0);
                subscription.setLastSuccessAt(OffsetDateTime.now());
                subscriptionRepository.save(subscription);
            } else {
                subscription.setFailureCount(subscription.getFailureCount() + 1);
                subscriptionRepository.save(subscription);
                log.warn("Push to subscription {} failed with status {}", subscription.getId(), status);
            }
        }
    }

    /** Overridable so the delivery policy can be tested without a network. */
    protected int deliver(PushSubscription subscription, String payloadJson) {
        if (publicKey.isBlank() || privateKey.isBlank()) {
            log.warn("VAPID keys are not configured; push disabled");
            return 0;
        }
        try {
            PushService pushService = new PushService(publicKey, privateKey, subject);
            Notification notification = new Notification(
                    subscription.getEndpoint(), subscription.getP256dh(),
                    subscription.getAuth(), payloadJson.getBytes());
            return pushService.send(notification).getStatusLine().getStatusCode();
        } catch (Exception e) {
            log.warn("Push delivery to {} threw: {}", subscription.getId(), e.getMessage());
            return 500;
        }
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
```

- [ ] **Step 6: Add the VAPID configuration**

Em `backend/src/main/resources/application.yml`, adicione ao final:

```yaml
push:
  vapid:
    # Geradas fora do repositorio. Sem elas, o push fica desligado e o alerta
    # continua sendo gravado normalmente.
    public-key: ${PUSH_VAPID_PUBLIC_KEY:}
    private-key: ${PUSH_VAPID_PRIVATE_KEY:}
    subject: mailto:admin@edgeai.local
```

- [ ] **Step 7: Run the full suite**

```powershell
cd backend
.\gradlew.bat test
```

Esperado: PASS, com os 5 testes de `PushSenderTest`.

- [ ] **Step 8: Commit**

```bash
git add backend/build.gradle backend/src/main/java backend/src/main/resources/application.yml backend/src/test/java/com/edgeai/industrial/service/PushSenderTest.java
git commit -m "feat(backend): deliver opened alerts as web push, off the ingestion thread"
```

---

### Task 6: AlertController, PushController e CurrentUser

**Files:**
- Create: `backend/src/main/java/com/edgeai/industrial/dto/AlertDto.java`
- Create: `backend/src/main/java/com/edgeai/industrial/dto/PushSubscriptionDto.java`
- Create: `backend/src/main/java/com/edgeai/industrial/controller/AlertController.java`
- Create: `backend/src/main/java/com/edgeai/industrial/controller/PushController.java`
- Create: `backend/src/main/java/com/edgeai/industrial/security/CurrentUser.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/security/StoreUserDetails.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/security/UserDetailsServiceImpl.java`
- Test: `backend/src/test/java/com/edgeai/industrial/controller/AlertControllerTest.java`

**Interfaces:**
- Consumes: `AlertService` (Task 2), `PushSubscriptionRepository` (Task 5), `CurrentStore.id()` (já existente).
- Produces:
  - `StoreUserDetails.getUserId()` → `UUID`, construtor `(String username, String password, Collection<? extends GrantedAuthority> authorities, UUID storeId, UUID userId)`
  - `CurrentUser.id()` → `UUID`
  - `AlertDto(UUID id, String alertType, String severity, String message, boolean acknowledged, OffsetDateTime createdAt, OffsetDateTime resolvedAt)`
  - `PushSubscriptionDto(String endpoint, String p256dh, String auth)`

- [ ] **Step 1: Write the failing test**

Crie `backend/src/test/java/com/edgeai/industrial/controller/AlertControllerTest.java`:

```java
package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.dto.AlertDto;
import com.edgeai.industrial.security.StoreUserDetails;
import com.edgeai.industrial.service.AlertService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AlertControllerTest {

    @Mock private AlertService alertService;
    @InjectMocks private AlertController alertController;

    private UUID storeA;
    private UUID storeB;
    private UUID userId;

    @BeforeEach
    void setUp() {
        storeA = UUID.randomUUID();
        storeB = UUID.randomUUID();
        userId = UUID.randomUUID();
        authenticateAs(storeA, userId);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(UUID storeId, UUID user) {
        StoreUserDetails principal = new StoreUserDetails(
                "dono@loja.local", "hash",
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")), storeId, user);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    private Alert alert() {
        Alert a = new Alert();
        a.setId(UUID.randomUUID());
        a.setStoreId(storeA);
        a.setDeviceId(UUID.randomUUID());
        a.setAlertType(AlertService.TYPE_STOCK_LOW);
        a.setSeverity("high");
        a.setMessage("Arroz 5 kg: restam 4 unidades, minimo 5");
        a.setAcknowledged(false);
        return a;
    }

    @Test
    void listAsksOnlyForTheAuthenticatedStore() {
        when(alertService.list(storeA, true)).thenReturn(List.of(alert()));

        List<AlertDto> result = alertController.list(true);

        assertEquals(1, result.size());
        assertEquals("high", result.get(0).severity());
        verify(alertService).list(storeA, true);
    }

    @Test
    void listNeverReachesAnotherStore() {
        authenticateAs(storeB, userId);
        when(alertService.list(storeB, true)).thenReturn(List.of());

        assertTrue(alertController.list(true).isEmpty());
        verify(alertService, never()).list(eq(storeA), anyBoolean());
    }

    @Test
    void acknowledgePassesTheAuthenticatedUserAndStore() {
        UUID alertId = UUID.randomUUID();

        alertController.acknowledge(alertId);

        verify(alertService).acknowledge(alertId, storeA, userId);
    }

    @Test
    void countReturnsTheOpenTotalForTheStore() {
        when(alertService.countOpen(storeA)).thenReturn(3L);

        assertEquals(3L, alertController.count().get("open"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.controller.AlertControllerTest"
```

Esperado: FAIL na compilação — construtor de `StoreUserDetails` com cinco argumentos não existe.

- [ ] **Step 3: Carry the user id on the principal**

Em `backend/src/main/java/com/edgeai/industrial/security/StoreUserDetails.java`, adicione o campo e o parâmetro:

```java
    private final UUID storeId;
    private final UUID userId;

    public StoreUserDetails(String username, String password,
                            Collection<? extends GrantedAuthority> authorities,
                            UUID storeId, UUID userId) {
        super(username, password, authorities);
        this.storeId = storeId;
        this.userId = userId;
    }
```

Em `backend/src/main/java/com/edgeai/industrial/security/UserDetailsServiceImpl.java`, passe o id:

```java
                .map(user -> (UserDetails) new StoreUserDetails(
                        user.getEmail(),
                        user.getPasswordHash(),
                        List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().toUpperCase())),
                        user.getStoreId(),
                        user.getId()
                ))
```

Ajuste as construções de `StoreUserDetails` nos testes existentes (`ProductControllerTest`, `ShelfSlotControllerTest`, `SensorControllerTest`, `DeviceControllerTest`, `PickControllerTest`, `CurrentStoreTest`) acrescentando `UUID.randomUUID()` como quinto argumento.

- [ ] **Step 4: Write CurrentUser**

Crie `backend/src/main/java/com/edgeai/industrial/security/CurrentUser.java`:

```java
package com.edgeai.industrial.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/** Reads the authenticated user's id from the security context. */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static UUID id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof StoreUserDetails details)
                || details.getUserId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Usuario nao identificado");
        }
        return details.getUserId();
    }
}
```

- [ ] **Step 5: Write the DTOs**

Crie `backend/src/main/java/com/edgeai/industrial/dto/AlertDto.java`:

```java
package com.edgeai.industrial.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record AlertDto(
        UUID id,
        String alertType,
        String severity,
        String message,
        boolean acknowledged,
        OffsetDateTime createdAt,
        OffsetDateTime resolvedAt
) {
}
```

Crie `backend/src/main/java/com/edgeai/industrial/dto/PushSubscriptionDto.java`:

```java
package com.edgeai.industrial.dto;

public record PushSubscriptionDto(String endpoint, String p256dh, String auth) {
}
```

- [ ] **Step 6: Write AlertController**

Crie `backend/src/main/java/com/edgeai/industrial/controller/AlertController.java`:

```java
package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.dto.AlertDto;
import com.edgeai.industrial.security.CurrentStore;
import com.edgeai.industrial.security.CurrentUser;
import com.edgeai.industrial.service.AlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/alerts")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;

    @GetMapping
    public List<AlertDto> list(@RequestParam(defaultValue = "true") boolean onlyOpen) {
        return alertService.list(CurrentStore.id(), onlyOpen)
                .stream().map(AlertController::toDto).toList();
    }

    @GetMapping("/count")
    public Map<String, Long> count() {
        return Map.of("open", alertService.countOpen(CurrentStore.id()));
    }

    @PostMapping("/{id}/acknowledge")
    public void acknowledge(@PathVariable UUID id) {
        alertService.acknowledge(id, CurrentStore.id(), CurrentUser.id());
    }

    private static AlertDto toDto(Alert a) {
        return new AlertDto(a.getId(), a.getAlertType(), a.getSeverity(), a.getMessage(),
                Boolean.TRUE.equals(a.getAcknowledged()), a.getCreatedAt(), a.getResolvedAt());
    }
}
```

- [ ] **Step 7: Write PushController**

Crie `backend/src/main/java/com/edgeai/industrial/controller/PushController.java`:

```java
package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.PushSubscription;
import com.edgeai.industrial.dto.PushSubscriptionDto;
import com.edgeai.industrial.repository.PushSubscriptionRepository;
import com.edgeai.industrial.security.CurrentStore;
import com.edgeai.industrial.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/push")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class PushController {

    private final PushSubscriptionRepository subscriptionRepository;

    @Value("${push.vapid.public-key:}")
    private String publicKey;

    @GetMapping("/public-key")
    public Map<String, String> publicKey() {
        if (publicKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Notificacoes nao configuradas neste servidor");
        }
        return Map.of("publicKey", publicKey);
    }

    /** Re-subscribing from the same browser updates the row rather than duplicating it. */
    @PostMapping("/subscriptions")
    public void subscribe(@RequestBody PushSubscriptionDto body) {
        if (body.endpoint() == null || body.endpoint().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inscricao invalida");
        }
        PushSubscription subscription = subscriptionRepository.findByEndpoint(body.endpoint())
                .orElseGet(PushSubscription::new);
        subscription.setEndpoint(body.endpoint());
        subscription.setP256dh(body.p256dh());
        subscription.setAuth(body.auth());
        subscription.setStoreId(CurrentStore.id());
        subscription.setUserId(CurrentUser.id());
        subscription.setFailureCount(0);
        subscriptionRepository.save(subscription);
    }

    @DeleteMapping("/subscriptions")
    public void unsubscribe(@RequestParam String endpoint) {
        subscriptionRepository.findByEndpoint(endpoint)
                .filter(s -> s.getStoreId().equals(CurrentStore.id()))
                .ifPresent(subscriptionRepository::delete);
    }
}
```

- [ ] **Step 8: Run the full suite**

```powershell
cd backend
.\gradlew.bat test
```

Esperado: PASS. Se algum teste antigo quebrar por causa do quinto argumento de `StoreUserDetails`, ajuste-o conforme o Step 3.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java backend/src/test/java
git commit -m "feat(backend): expose alerts and push subscriptions over REST"
```

---

### Task 7: PWA — manifesto, ícones, service worker e tela de alertas

**Files:**
- Create: `frontend/scripts/generate-icons.mjs`
- Create: `frontend/public/icon-192.png` (gerado)
- Create: `frontend/public/icon-512.png` (gerado)
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/sw.js`
- Create: `frontend/public/offline.html`
- Create: `frontend/src/components/PushToggle.tsx`
- Create: `frontend/src/app/dashboard/alerts/page.tsx`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/apiClient.ts`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/alerts`, `GET /api/alerts/count`, `POST /api/alerts/{id}/acknowledge`, `GET /api/push/public-key`, `POST` e `DELETE` em `/api/push/subscriptions` (Task 6).
- Produces: tipo `Alert` em `@/types`; métodos `apiClient.getAlerts`, `getAlertCount`, `acknowledgeAlert`, `getPushPublicKey`, `subscribePush`, `unsubscribePush`.

- [ ] **Step 1: Generate the icons**

Crie `frontend/scripts/generate-icons.mjs`. Escreve dois PNG sem nenhuma dependência — fundo no verde do sistema com três barras brancas, uma prateleira estilizada:

```javascript
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const BG = [20, 98, 74];      // verde de etiqueta de preco
const FG = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, path) {
  const raw = [];
  // Tres barras horizontais: uma prateleira vista de frente.
  const bars = [[0.28, 0.36], [0.46, 0.54], [0.64, 0.72]];
  for (let y = 0; y < size; y++) {
    raw.push(0); // filtro "none" por linha
    const yr = y / size;
    const onBar = bars.some(([a, b]) => yr >= a && yr < b);
    for (let x = 0; x < size; x++) {
      const xr = x / size;
      const inside = xr > 0.2 && xr < 0.8;
      const [r, g, b] = onBar && inside ? FG : BG;
      raw.push(r, g, b);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 2;   // truecolor RGB
  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, out);
  console.log('wrote', path, out.length, 'bytes');
}

mkdirSync('public', { recursive: true });
png(192, 'public/icon-192.png');
png(512, 'public/icon-512.png');
```

Rode:

```powershell
cd frontend
node scripts/generate-icons.mjs
```

Esperado: dois arquivos criados. Abra `public/icon-192.png` e confirme que é um quadrado verde com três barras brancas.

- [ ] **Step 2: Write the manifest and the offline page**

Crie `frontend/public/manifest.json`:

```json
{
  "name": "Gôndola — Controle de Prateleira",
  "short_name": "Gôndola",
  "description": "Avisa quando o produto está acabando na prateleira.",
  "start_url": "/dashboard/alerts",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0F1411",
  "theme_color": "#14624A",
  "lang": "pt-BR",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

Crie `frontend/public/offline.html`:

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sem conexão</title>
  <style>
    body { background:#0F1411; color:#E7EEE9; font-family: system-ui, sans-serif;
           display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    div { text-align:center; padding:1.5rem; }
    p { color:#A8B7B0; }
  </style>
</head>
<body>
  <div>
    <h1>Sem conexão</h1>
    <p>Os alertas voltam assim que a internet voltar.</p>
  </div>
</body>
</html>
```

- [ ] **Step 3: Write the service worker**

Crie `frontend/public/sw.js`:

```javascript
// Service worker do PWA. Tres responsabilidades: mostrar a notificacao que
// chega por push, abrir a lista ao clicar nela, e responder com uma pagina de
// fallback quando a rede falha. O handler de fetch nao e enfeite: sem ele o
// Chrome nao oferece a instalacao, e sem instalacao o iOS nao entrega push.

const CACHE = 'gondola-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Gôndola', body: 'Novo alerta', url: '/dashboard/alerts' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // Payload nao-JSON: mantem o texto padrao em vez de engolir o aviso.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
      tag: 'gondola-alert'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard/alerts';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 4: Link the manifest**

Em `frontend/src/app/layout.tsx`, adicione ao objeto `metadata` (ou crie-o se não existir):

```tsx
export const metadata = {
  title: 'Gôndola — Controle de Prateleira',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#14624A',
};
```

Mantenha o restante do arquivo como está.

- [ ] **Step 5: Add the types and the apiClient methods**

Em `frontend/src/types/index.ts`, adicione:

```typescript
export interface Alert {
  id: string;
  alertType: 'stock_low' | 'device_silent';
  severity: 'high' | 'medium';
  message: string;
  acknowledged: boolean;
  createdAt: string;
  resolvedAt: string | null;
}
```

Em `frontend/src/services/apiClient.ts`, dentro do objeto `apiClient`, adicione:

```typescript
  getAlerts: (onlyOpen = true) =>
    request<import('@/types').Alert[]>(`/alerts?onlyOpen=${onlyOpen}`),
  getAlertCount: () => request<{ open: number }>('/alerts/count'),
  acknowledgeAlert: (id: string) =>
    request<void>(`/alerts/${id}/acknowledge`, { method: 'POST' }),
  getPushPublicKey: () => request<{ publicKey: string }>('/push/public-key'),
  subscribePush: (body: { endpoint: string; p256dh: string; auth: string }) =>
    request<void>('/push/subscriptions', { method: 'POST', body: JSON.stringify(body) }),
  unsubscribePush: (endpoint: string) =>
    request<void>(`/push/subscriptions?endpoint=${encodeURIComponent(endpoint)}`, { method: 'DELETE' }),
```

- [ ] **Step 6: Write PushToggle**

Crie `frontend/src/components/PushToggle.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/services/apiClient';

type State = 'unsupported' | 'idle' | 'enabled' | 'denied' | 'working';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function PushToggle() {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.register('/sw.js').then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setState('enabled');
      })
    ).catch(() => setError('Não foi possível registrar o service worker.'));
  }, []);

  async function enable() {
    setError(null);
    setState('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await apiClient.getPushPublicKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await apiClient.subscribePush({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      });
      setState('enabled');
    } catch {
      setState('idle');
      setError('Não foi possível ativar os alertas neste aparelho.');
    }
  }

  async function disable() {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiClient.unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('idle');
    } catch {
      setError('Não foi possível desativar.');
      setState('enabled');
    }
  }

  if (state === 'unsupported') {
    return (
      <p className="text-sm text-gray-400">
        Este navegador não suporta notificações. Abra pelo Chrome no Android ou
        instale o app na tela de início do iPhone.
      </p>
    );
  }

  if (state === 'denied') {
    return (
      <p className="text-sm text-yellow-400" role="alert">
        As notificações foram bloqueadas neste aparelho. Para reativar, abra as
        configurações do navegador para este site e permita notificações.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state === 'enabled' ? (
        <button
          onClick={disable}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm rounded px-3 py-1.5"
        >
          Desativar alertas neste aparelho
        </button>
      ) : (
        <button
          onClick={enable}
          disabled={state === 'working'}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded px-3 py-1.5"
        >
          {state === 'working' ? 'Ativando...' : 'Ativar alertas neste aparelho'}
        </button>
      )}
      {state === 'enabled' && (
        <span className="text-sm text-green-400">Alertas ativos</span>
      )}
      {error && <p role="alert" className="text-red-400 text-sm w-full">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 7: Write the alerts page**

Crie `frontend/src/app/dashboard/alerts/page.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import { Alert } from '@/types';
import { apiClient } from '@/services/apiClient';
import { usePolling } from '@/hooks/usePolling';
import { PushToggle } from '@/components/PushToggle';

const LABEL: Record<string, string> = {
  stock_low: 'Estoque baixo',
  device_silent: 'Sensor sem sinal',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    apiClient
      .getAlerts(!showAll)
      .then((data) => {
        setAlerts(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [showAll]);

  usePolling(load, 10000);

  function acknowledge(id: string) {
    apiClient.acknowledgeAlert(id).then(load).catch(console.error);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-white">Alertas</h1>

      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 mb-6">
        <PushToggle />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
          className="accent-blue-600"
        />
        Mostrar também os já vistos e resolvidos
      </label>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : alerts.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum alerta. As prateleiras estão abastecidas.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-wrap items-center gap-3"
            >
              <span
                className={`text-xs font-semibold rounded px-2 py-1 ${
                  a.severity === 'high'
                    ? 'bg-red-900 text-red-200'
                    : 'bg-yellow-900 text-yellow-200'
                }`}
              >
                {LABEL[a.alertType] ?? a.alertType}
              </span>
              <span className="text-gray-100 text-sm flex-1 min-w-0">{a.message}</span>
              <time className="text-xs text-gray-500 tabular-nums">
                {new Date(a.createdAt).toLocaleString('pt-BR')}
              </time>
              {a.resolvedAt ? (
                <span className="text-xs text-green-400">resolvido</span>
              ) : a.acknowledged ? (
                <span className="text-xs text-gray-500">visto</span>
              ) : (
                <button
                  onClick={() => acknowledge(a.id)}
                  className="bg-gray-700 hover:bg-gray-600 text-white text-xs rounded px-2 py-1"
                >
                  Marcar como visto
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Add the nav link with the open count**

Substitua `frontend/src/app/dashboard/layout.tsx` por uma versão cliente que busca o contador:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/services/apiClient';
import { usePolling } from '@/hooks/usePolling';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [openAlerts, setOpenAlerts] = useState(0);

  usePolling(() => {
    apiClient
      .getAlertCount()
      .then((r) => setOpenAlerts(r.open))
      .catch(() => setOpenAlerts(0));
  }, 15000);

  return (
    <div className="flex min-h-screen">
      <nav className="w-48 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Edge AI</p>
        <Link href="/dashboard" className="text-sm text-gray-300 hover:text-white py-1">
          Dispositivos
        </Link>
        <Link href="/dashboard/readings" className="text-sm text-gray-300 hover:text-white py-1">
          Leituras
        </Link>
        <Link href="/dashboard/anomalies" className="text-sm text-gray-300 hover:text-white py-1">
          Anomalias
        </Link>
        <Link href="/dashboard/picks" className="text-sm text-gray-300 hover:text-white py-1">
          Retiradas
        </Link>
        <Link
          href="/dashboard/alerts"
          className="text-sm text-gray-300 hover:text-white py-1 flex items-center gap-2"
        >
          Alertas
          {openAlerts > 0 && (
            <span className="bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 tabular-nums">
              {openAlerts}
            </span>
          )}
        </Link>
        <Link href="/dashboard/settings" className="text-sm text-gray-300 hover:text-white py-1">
          Configuração
        </Link>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 9: Verify the build**

```powershell
cd frontend
npm run build
```

Esperado: build sem erros de TypeScript, com `/dashboard/alerts` na lista de rotas.

- [ ] **Step 10: Commit**

```bash
git add frontend/public frontend/scripts frontend/src
git commit -m "feat(frontend): add installable PWA with push and the alerts screen"
```

---

### Task 8: Teste de integração da deduplicação e roteiro da demonstração

**Files:**
- Modify: `backend/src/test/java/com/edgeai/industrial/isolation/StoreIsolationIntegrationTest.java`
- Create: `docs/pji610/P3-roteiro-da-demonstracao.md`

**Interfaces:**
- Consumes: `AlertRepository`, `Alert` (Task 2); migration `V008` (Task 1).
- Produces: nada.

- [ ] **Step 1: Add V008 to the migration list**

Em `StoreIsolationIntegrationTest.applyMigrations()`, acrescente o arquivo à lista:

```java
            for (String file : List.of("V001__initial_schema.sql",
                                       "V003__pick_events.sql",
                                       "V004__retail_domain.sql",
                                       "V008__alerts_and_push.sql")) {
```

Adicione `@Autowired private AlertRepository alertRepository;` junto aos demais repositórios injetados.

- [ ] **Step 2: Write the failing test**

Adicione ao final da classe:

Os campos `storeA`, `storeB`, `deviceA`, `deviceB`, `slotA` e `slotB` já existem na classe e são `UUID` diretos, semeados em `seedTwoStores()` — não são entidades, então **não** chame `.getId()` neles.

```java
    private Alert alertFor(UUID storeId, UUID deviceId, UUID slotId, String message) {
        Alert a = new Alert();
        a.setStoreId(storeId);
        a.setDeviceId(deviceId);
        a.setShelfSlotId(slotId);
        a.setAlertType("stock_low");
        a.setSeverity("high");
        a.setMessage(message);
        return a;
    }

    @Test
    void thePartialIndexRefusesASecondOpenAlertForTheSameSlot() {
        alertRepository.saveAndFlush(alertFor(storeA, deviceA, slotA, "primeiro"));

        Alert second = alertFor(storeA, deviceA, slotA, "segundo");

        assertThatThrownBy(() -> alertRepository.saveAndFlush(second))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aResolvedAlertDoesNotBlockTheNextOne() {
        Alert first = alertFor(storeA, deviceA, slotA, "primeiro");
        first.setResolvedAt(OffsetDateTime.now());
        alertRepository.saveAndFlush(first);

        Alert second = alertFor(storeA, deviceA, slotA, "segundo");

        assertThatCode(() -> alertRepository.saveAndFlush(second)).doesNotThrowAnyException();
    }

    @Test
    void alertsOfStoreBNeverReachStoreA() {
        alertRepository.saveAndFlush(alertFor(storeB, deviceB, slotB, "da loja B"));

        assertThat(alertRepository.findByStoreIdOrderByCreatedAtDesc(storeA))
                .noneMatch(a -> a.getStoreId().equals(storeB));
    }
```

Adicione os imports `com.edgeai.industrial.domain.Alert`, `com.edgeai.industrial.repository.AlertRepository`, `org.springframework.dao.DataIntegrityViolationException`, e os estáticos `assertThatThrownBy` e `assertThatCode` de `org.assertj.core.api.Assertions`.

- [ ] **Step 3: Run the integration test**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.isolation.StoreIsolationIntegrationTest"
```

Esperado: PASS, com os três testes novos. Se a classe inteira for pulada, o Docker não está acessível — suba o Docker Desktop e rode de novo. **Um "skipped" aqui não conta como verde.**

- [ ] **Step 4: Write the demo runbook**

Crie `docs/pji610/P3-roteiro-da-demonstracao.md`:

```markdown
# Roteiro da demonstração — alertas no celular

O push exige contexto seguro. `localhost` serve para o notebook; o celular
precisa de HTTPS de verdade, e por isso a demonstração usa um túnel.

## Antes de começar

1. Suba a infraestrutura: `docker compose up -d`
2. Suba o backend: `cd backend`, `.\gradlew.bat bootRun`
3. Suba o frontend: `cd frontend`, `npm run dev`
4. Suba o túnel apontando para a porta 3000:
   `cloudflared tunnel --url http://localhost:3000`
5. Anote a URL HTTPS que o túnel imprimiu.

## Gerar as chaves VAPID (uma vez só)

Com Node instalado:

    npx web-push generate-vapid-keys

Exporte antes de subir o backend, **sem commitar**:

    $env:PUSH_VAPID_PUBLIC_KEY  = "<chave publica>"
    $env:PUSH_VAPID_PRIVATE_KEY = "<chave privada>"

Sem as chaves o sistema continua funcionando: os alertas são gravados e
aparecem na tela, apenas não viram notificação.

## No celular, a cada nova sessão de túnel

A inscrição de push é vinculada à origem, e a URL do túnel muda a cada vez.
Então, **toda vez**:

1. Abra a URL do túnel no celular e faça login.
2. Instale na tela de início — no iPhone isso é obrigatório para receber push.
3. Abra Alertas e toque em "Ativar alertas neste aparelho".
4. Aceite a permissão.

## Provocar a ruptura

Retire pacotes da bandeja até cruzar o mínimo configurado. O alerta aparece
na lista em até 10 segundos e chega como notificação mesmo com o app fechado.

Repor os pacotes resolve o alerta sozinho — vale mostrar, porque é o que
diferencia um aviso de um registro que alguém tem que limpar depois.

## Se a bancada falhar no dia

O simulador Python substitui o hardware:

    cd firmware/simulator
    python esp32_sensor_simulator.py --interval 5

Ele reduz o peso periodicamente e dispara a mesma regra.
```

- [ ] **Step 5: Run the full suite and the frontend build**

```powershell
cd backend
.\gradlew.bat test
cd ../frontend
npm run build
```

Esperado: ambos verdes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/test/java/com/edgeai/industrial/isolation/StoreIsolationIntegrationTest.java docs/pji610/P3-roteiro-da-demonstracao.md
git commit -m "test(backend): prove alert deduplication against a real database"
```

---

## Verificação final contra os critérios de aceite da spec

| # | Critério | Onde |
|---|---|---|
| 1 | Cruzar o mínimo gera exatamente um `stock_low` | Task 3, `crossingBelowTheMinimumOpensExactlyOneStockAlert` |
| 2 | Continuar retirando não gera alertas adicionais | Task 3, `stayingBelowTheMinimumDoesNotOpenAnotherAlert` + Task 2, `openIsANoOp...` |
| 3 | Repor resolve automaticamente | Task 3, `climbingBackAboveTheMinimumResolvesTheAlert` |
| 4 | Dispositivo parado gera `device_silent`; voltar resolve | Task 4, ambos os testes |
| 5 | Instala como aplicativo em Android e iOS | Task 7 + roteiro da Task 8 — verificação manual |
| 6 | Notificação chega com o app fechado | Roteiro da Task 8 — verificação manual |
| 7 | Clicar na notificação abre a lista | Task 7, `notificationclick` — verificação manual |
| 8 | Inscrição inválida removida no primeiro 410 | Task 5, `aGoneSubscriptionIsDeletedOnTheSpot` |
| 9 | Alertas não cruzam lojas | Task 6, `listNeverReachesAnotherStore` + Task 8, `alertsOfStoreBNeverReachStoreA` |
| 10 | Suíte de backend verde | Comandos da Task 8, Step 5 |

**Itens 5, 6 e 7 não têm teste automatizado** — service worker é código de navegador. Eles dependem do roteiro manual da Task 8 e precisam ser executados uma vez antes de qualquer alegação de que o PWA funciona.
