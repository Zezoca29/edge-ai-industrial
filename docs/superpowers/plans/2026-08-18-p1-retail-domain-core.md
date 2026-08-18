# P1 — Núcleo de Domínio de Varejo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o sistema saber *qual produto* está em *qual prateleira* e *quantas unidades restam*, com essa configuração editável por tela em vez de recompilada no firmware.

**Architecture:** Três tabelas novas (`stores`, `products`, `shelf_slots`) escopadas por loja. O ESP32 passa a publicar apenas peso absoluto e um flag de estabilidade; um `ShelfCalculator` puro converte peso em quantidade (`qty = round((peso − tara) / peso_unitário)`) e um `ShelfService` compara com a quantidade anterior para gerar `pick_event` na queda e registrar reposição na subida. O escopo de loja é aplicado carregando o usuário do banco a cada requisição.

**Tech Stack:** Java 21, Spring Boot 3.3, Spring Data JPA, JdbcTemplate, JUnit 5 + Mockito, PostgreSQL 16 + TimescaleDB, Next.js 15 + React 19 + Tailwind 3, Arduino/ESP32 (Wokwi), Python 3.10 + paho-mqtt.

**Spec:** `docs/superpowers/specs/2026-08-18-pji610-varejo-design.md`

## Global Constraints

- Java 21 (toolchain fixada em `backend/build.gradle`). Spring Boot 3.3.0.
- **Rode build e testes dentro do módulo, nunca na raiz do repositório.** Backend: `cd backend` antes de `.\gradlew.bat`. Frontend: `cd frontend` antes de `npm`.
- Shell primário é PowerShell no Windows. `<` para redirecionar arquivo **não funciona** em PowerShell — use `Get-Content arquivo | comando`.
- PostgreSQL do Docker responde na porta **5433** (5432 é o PostgreSQL nativo do Windows).
- As migrations são montadas em `/docker-entrypoint-initdb.d` ([docker-compose.yml:19](../../../docker-compose.yml#L19)), que **só executa em volume vazio**. Em banco já existente, aplique o SQL manualmente (Task 2 mostra como).
- Entidades JPA seguem o padrão existente: chaves estrangeiras como coluna `UUID` simples, sem `@ManyToOne`. Não introduza relacionamentos JPA.
- Pesos são persistidos em **gramas** (`unit_weight_g`, `tare_g`, `current_weight_g`). O payload MQTT continua em **kg** com o campo `unit` explícito; a conversão acontece no backend.
- Código, identificadores e mensagens de commit em inglês. Texto de interface em pt-BR.
- Todo commit deve deixar `.\gradlew.bat test` verde.

---

### Task 1: ShelfCalculator — conversão peso→quantidade

Lógica pura, sem banco e sem Spring. É onde os bugs reais do domínio vão morar, então vem primeiro e é a mais testada.

**Files:**
- Create: `backend/src/main/java/com/edgeai/industrial/service/ShelfCalculator.java`
- Test: `backend/src/test/java/com/edgeai/industrial/service/ShelfCalculatorTest.java`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ShelfCalculator.Result` — record com `double rawUnits`, `int roundedQty`, `double confidence`, `boolean suspect`
  - `static Result compute(double weightG, double tareG, double unitWeightG, double toleranceG)`
  - `static int nextQty(Integer currentQty, double rawUnits)`
  - `static double toGrams(double value, String unit)`

- [ ] **Step 1: Write the failing test**

Crie `backend/src/test/java/com/edgeai/industrial/service/ShelfCalculatorTest.java`:

```java
package com.edgeai.industrial.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ShelfCalculatorTest {

    @Test
    void computeExactMultipleGivesFullConfidence() {
        ShelfCalculator.Result r = ShelfCalculator.compute(1000.0, 0.0, 200.0, 5.0);
        assertEquals(5.0, r.rawUnits(), 0.0001);
        assertEquals(5, r.roundedQty());
        assertEquals(1.0, r.confidence(), 0.0001);
        assertFalse(r.suspect());
    }

    @Test
    void computeSubtractsTareBeforeCounting() {
        ShelfCalculator.Result r = ShelfCalculator.compute(1200.0, 200.0, 200.0, 5.0);
        assertEquals(5, r.roundedQty());
        assertFalse(r.suspect());
    }

    @Test
    void computeHalfwayBetweenUnitsGivesZeroConfidenceAndIsSuspect() {
        ShelfCalculator.Result r = ShelfCalculator.compute(900.0, 0.0, 200.0, 5.0);
        assertEquals(4.5, r.rawUnits(), 0.0001);
        assertEquals(0.0, r.confidence(), 0.0001);
        assertTrue(r.suspect(), "100g de resto contra tolerancia de 5g deve ser suspeito");
    }

    @Test
    void computeSmallNoiseWithinToleranceIsNotSuspect() {
        ShelfCalculator.Result r = ShelfCalculator.compute(1003.0, 0.0, 200.0, 5.0);
        assertEquals(5, r.roundedQty());
        assertFalse(r.suspect());
        assertTrue(r.confidence() > 0.9);
    }

    @Test
    void computeEmptyShelfGivesZero() {
        ShelfCalculator.Result r = ShelfCalculator.compute(200.0, 200.0, 200.0, 5.0);
        assertEquals(0, r.roundedQty());
        assertFalse(r.suspect());
    }

    @Test
    void computeBelowTareSaturatesAtZeroAndFlagsSuspect() {
        ShelfCalculator.Result r = ShelfCalculator.compute(150.0, 200.0, 200.0, 5.0);
        assertEquals(0, r.roundedQty());
        assertTrue(r.suspect(), "peso abaixo da tara significa bandeja removida");
    }

    @Test
    void nextQtyKeepsCurrentInsideDeadband() {
        assertEquals(5, ShelfCalculator.nextQty(5, 4.7));
        assertEquals(5, ShelfCalculator.nextQty(5, 5.3));
    }

    @Test
    void nextQtyMovesOutsideDeadband() {
        assertEquals(4, ShelfCalculator.nextQty(5, 4.3));
        assertEquals(6, ShelfCalculator.nextQty(5, 5.8));
    }

    @Test
    void nextQtyInitializesWhenCurrentIsNull() {
        assertEquals(5, ShelfCalculator.nextQty(null, 4.7));
    }

    @Test
    void nextQtyNeverGoesNegative() {
        assertEquals(0, ShelfCalculator.nextQty(2, -0.4));
    }

    @Test
    void toGramsConvertsKilogramsAndPassesGramsThrough() {
        assertEquals(1500.0, ShelfCalculator.toGrams(1.5, "kg"), 0.0001);
        assertEquals(1500.0, ShelfCalculator.toGrams(1500.0, "g"), 0.0001);
        assertEquals(1500.0, ShelfCalculator.toGrams(1.5, null), 0.0001);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.service.ShelfCalculatorTest"
```

Esperado: FAIL na compilação — `cannot find symbol: class ShelfCalculator`.

- [ ] **Step 3: Write minimal implementation**

Crie `backend/src/main/java/com/edgeai/industrial/service/ShelfCalculator.java`:

```java
package com.edgeai.industrial.service;

/**
 * Pure domain logic: converts an absolute shelf weight into a unit count.
 *
 * The absolute weight is the source of truth. A missed reading or a bad
 * delta never desynchronises the stock permanently — the next good
 * reading corrects it.
 */
public final class ShelfCalculator {

    /** A qty change is only accepted once the reading is this far from the current count. */
    private static final double DEADBAND_UNITS = 0.6;

    private ShelfCalculator() {
    }

    public record Result(double rawUnits, int roundedQty, double confidence, boolean suspect) {
    }

    public static Result compute(double weightG, double tareG, double unitWeightG, double toleranceG) {
        double netG = weightG - tareG;

        if (netG < -toleranceG) {
            // Below tare: the tray itself was removed. Never report negative stock.
            return new Result(0.0, 0, 0.0, true);
        }
        if (netG < 0.0) {
            netG = 0.0;
        }

        double rawUnits = netG / unitWeightG;
        int roundedQty = (int) Math.round(rawUnits);

        double residualUnits = Math.abs(rawUnits - roundedQty);
        double confidence = Math.max(0.0, 1.0 - 2.0 * residualUnits);
        boolean suspect = residualUnits * unitWeightG > toleranceG;

        return new Result(rawUnits, roundedQty, confidence, suspect);
    }

    public static int nextQty(Integer currentQty, double rawUnits) {
        int rounded = Math.max(0, (int) Math.round(rawUnits));
        if (currentQty == null) {
            return rounded;
        }
        if (Math.abs(rawUnits - currentQty) < DEADBAND_UNITS) {
            return currentQty;
        }
        return rounded;
    }

    public static double toGrams(double value, String unit) {
        if (unit != null && unit.equalsIgnoreCase("g")) {
            return value;
        }
        return value * 1000.0;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.service.ShelfCalculatorTest"
```

Esperado: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/edgeai/industrial/service/ShelfCalculator.java backend/src/test/java/com/edgeai/industrial/service/ShelfCalculatorTest.java
git commit -m "feat(backend): add ShelfCalculator for weight-derived stock counting"
```

---

### Task 2: Migration V004 + seed V005

**Files:**
- Create: `database/migrations/V004__retail_domain.sql`
- Create: `database/migrations/V005__seed_demo_store.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabelas `stores`, `products`, `shelf_slots`; colunas `users.store_id`, `devices.store_id`, `pick_events.product_id`, `pick_events.store_id`.

- [ ] **Step 1: Write the migration**

Crie `database/migrations/V004__retail_domain.sql`:

```sql
-- V004 - Retail domain: stores, products and shelf slots
-- Turns the generic industrial monitor into a shelf-stockout platform.

CREATE TABLE IF NOT EXISTS stores (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    cnpj       VARCHAR(18),
    address    TEXT,
    timezone   TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users   ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id);

CREATE TABLE IF NOT EXISTS products (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id         UUID NOT NULL REFERENCES stores(id),
    name             TEXT NOT NULL,
    sku              TEXT,
    unit_weight_g    NUMERIC(10,2) NOT NULL CHECK (unit_weight_g > 0),
    tolerance_g      NUMERIC(10,2) NOT NULL DEFAULT 5,
    unit_price_cents INT,
    active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_id, sku)
);

CREATE TABLE IF NOT EXISTS shelf_slots (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id        UUID NOT NULL REFERENCES devices(id),
    slot_index       SMALLINT NOT NULL DEFAULT 0,
    product_id       UUID REFERENCES products(id),
    tare_g           NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_qty          INT NOT NULL DEFAULT 3,
    current_qty      INT,
    current_weight_g NUMERIC(10,2),
    suspect          BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (device_id, slot_index)
);

ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
ALTER TABLE pick_events ADD COLUMN IF NOT EXISTS store_id   UUID REFERENCES stores(id);

CREATE INDEX IF NOT EXISTS idx_products_store    ON products (store_id, active);
CREATE INDEX IF NOT EXISTS idx_shelf_slots_device ON shelf_slots (device_id, slot_index);
CREATE INDEX IF NOT EXISTS idx_pick_events_store ON pick_events (store_id, time DESC);
```

- [ ] **Step 2: Write the seed**

Crie `database/migrations/V005__seed_demo_store.sql`:

```sql
-- V005 - Demo store, admin binding and starter products.
-- Replace the product rows with the real ones collected in P0 (merchant interview).

INSERT INTO stores (id, name, cnpj, address)
VALUES ('11111111-1111-1111-1111-111111111111', 'Mercadinho Demo', NULL, 'Rua Exemplo, 100')
ON CONFLICT (id) DO NOTHING;

UPDATE users
SET store_id = '11111111-1111-1111-1111-111111111111'
WHERE store_id IS NULL;

UPDATE devices
SET store_id = '11111111-1111-1111-1111-111111111111'
WHERE store_id IS NULL;

INSERT INTO products (store_id, name, sku, unit_weight_g, tolerance_g, unit_price_cents)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Arroz 1kg',        'ARZ-1KG', 1000.00, 15.00, 650),
    ('11111111-1111-1111-1111-111111111111', 'Feijao 1kg',       'FJO-1KG', 1000.00, 15.00, 890),
    ('11111111-1111-1111-1111-111111111111', 'Leite Caixa 1L',   'LTE-1L',  1030.00, 15.00, 550),
    ('11111111-1111-1111-1111-111111111111', 'Cafe 500g',        'CAF-500', 500.00,  10.00, 1790)
ON CONFLICT (store_id, sku) DO NOTHING;
```

- [ ] **Step 3: Apply to the running database**

O mount `initdb.d` só roda em volume vazio, então aplique manualmente:

```powershell
Get-Content database/migrations/V004__retail_domain.sql | docker exec -i edgeai-postgres psql -U edgeai -d edgeai
Get-Content database/migrations/V005__seed_demo_store.sql | docker exec -i edgeai-postgres psql -U edgeai -d edgeai
```

- [ ] **Step 4: Verify the schema landed**

```powershell
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "\d shelf_slots"
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "SELECT name, unit_weight_g FROM products;"
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "SELECT email, store_id FROM users;"
```

Esperado: `shelf_slots` com 10 colunas; 4 produtos listados; `admin@edgeai.local` com `store_id` preenchido.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/V004__retail_domain.sql database/migrations/V005__seed_demo_store.sql
git commit -m "feat(db): add retail domain schema and demo store seed"
```

---

### Task 3: Entidades e repositórios

**Files:**
- Create: `backend/src/main/java/com/edgeai/industrial/domain/Store.java`
- Create: `backend/src/main/java/com/edgeai/industrial/domain/Product.java`
- Create: `backend/src/main/java/com/edgeai/industrial/domain/ShelfSlot.java`
- Create: `backend/src/main/java/com/edgeai/industrial/repository/StoreRepository.java`
- Create: `backend/src/main/java/com/edgeai/industrial/repository/ProductRepository.java`
- Create: `backend/src/main/java/com/edgeai/industrial/repository/ShelfSlotRepository.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/domain/User.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/domain/Device.java`
- Test: `backend/src/test/java/com/edgeai/industrial/domain/ShelfSlotTest.java`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `Store` — `getId()`, `getName()`, `getCnpj()`, `getAddress()`, `getTimezone()`
  - `Product` — `getId()`, `getStoreId()`, `getName()`, `getSku()`, `getUnitWeightG()` (`Double`), `getToleranceG()` (`Double`), `getUnitPriceCents()` (`Integer`), `getActive()` (`Boolean`)
  - `ShelfSlot` — `getId()`, `getDeviceId()`, `getSlotIndex()` (`Short`), `getProductId()`, `getTareG()` (`Double`), `getMinQty()` (`Integer`), `getCurrentQty()` (`Integer`), `getCurrentWeightG()` (`Double`), `getSuspect()` (`Boolean`) e respectivos setters
  - `User.getStoreId()` / `setStoreId(UUID)`, `Device.getStoreId()` / `setStoreId(UUID)`
  - `ShelfSlotRepository.findByDeviceIdAndSlotIndex(UUID, Short)` → `Optional<ShelfSlot>`
  - `ShelfSlotRepository.findByStoreId(UUID)` → `List<ShelfSlot>`
  - `ProductRepository.findByStoreIdOrderByNameAsc(UUID)` → `List<Product>`
  - `ProductRepository.findByIdAndStoreId(UUID, UUID)` → `Optional<Product>`

- [ ] **Step 1: Write the failing test**

Crie `backend/src/test/java/com/edgeai/industrial/domain/ShelfSlotTest.java`:

```java
package com.edgeai.industrial.domain;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class ShelfSlotTest {

    @Test
    void newSlotDefaultsToIndexZeroAndNoProduct() {
        ShelfSlot slot = new ShelfSlot();
        assertEquals(Short.valueOf((short) 0), slot.getSlotIndex());
        assertNull(slot.getProductId(), "um slot novo nasce sem produto configurado");
        assertEquals(0.0, slot.getTareG(), 0.0001);
        assertEquals(3, slot.getMinQty());
        assertFalse(slot.getSuspect());
    }

    @Test
    void slotHoldsDeviceAndProductBinding() {
        UUID deviceId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        ShelfSlot slot = new ShelfSlot();
        slot.setDeviceId(deviceId);
        slot.setProductId(productId);
        slot.setCurrentQty(7);

        assertEquals(deviceId, slot.getDeviceId());
        assertEquals(productId, slot.getProductId());
        assertEquals(7, slot.getCurrentQty());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.domain.ShelfSlotTest"
```

Esperado: FAIL na compilação — `cannot find symbol: class ShelfSlot`.

- [ ] **Step 3: Write the entities**

Crie `backend/src/main/java/com/edgeai/industrial/domain/Store.java`:

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
@Table(name = "stores")
public class Store {

    @EqualsAndHashCode.Include
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String cnpj;

    private String address;

    @Column(nullable = false)
    private String timezone = "America/Sao_Paulo";

    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }
}
```

Crie `backend/src/main/java/com/edgeai/industrial/domain/Product.java`:

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
@Table(name = "products")
public class Product {

    @EqualsAndHashCode.Include
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "store_id", nullable = false)
    private UUID storeId;

    @Column(nullable = false)
    private String name;

    private String sku;

    /** Weight of a single unit, in grams. Drives the whole stock count. */
    @Column(name = "unit_weight_g", nullable = false)
    private Double unitWeightG;

    /** Accepted gap between the reading and the expected integer multiple. */
    @Column(name = "tolerance_g", nullable = false)
    private Double toleranceG = 5.0;

    @Column(name = "unit_price_cents")
    private Integer unitPriceCents;

    @Column(nullable = false)
    private Boolean active = true;

    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }
}
```

Crie `backend/src/main/java/com/edgeai/industrial/domain/ShelfSlot.java`:

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
@Table(name = "shelf_slots")
public class ShelfSlot {

    @EqualsAndHashCode.Include
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "device_id", nullable = false)
    private UUID deviceId;

    /** P1 only ever uses 0. The column exists so multi-cell devices need no migration. */
    @Column(name = "slot_index", nullable = false)
    private Short slotIndex = 0;

    /** Null means the slot is not configured yet. */
    @Column(name = "product_id")
    private UUID productId;

    @Column(name = "tare_g", nullable = false)
    private Double tareG = 0.0;

    @Column(name = "min_qty", nullable = false)
    private Integer minQty = 3;

    @Column(name = "current_qty")
    private Integer currentQty;

    @Column(name = "current_weight_g")
    private Double currentWeightG;

    @Column(nullable = false)
    private Boolean suspect = false;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    @PreUpdate
    void touch() {
        this.updatedAt = OffsetDateTime.now();
    }
}
```

- [ ] **Step 4: Add store_id to User and Device**

Em `backend/src/main/java/com/edgeai/industrial/domain/User.java`, adicione após o campo `active`:

```java
    @Column(name = "store_id")
    private UUID storeId;
```

Em `backend/src/main/java/com/edgeai/industrial/domain/Device.java`, adicione após o campo `status`:

```java
    @Column(name = "store_id")
    private UUID storeId;
```

- [ ] **Step 5: Write the repositories**

Crie `backend/src/main/java/com/edgeai/industrial/repository/StoreRepository.java`:

```java
package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.Store;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface StoreRepository extends JpaRepository<Store, UUID> {
}
```

Crie `backend/src/main/java/com/edgeai/industrial/repository/ProductRepository.java`:

```java
package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ProductRepository extends JpaRepository<Product, UUID> {

    List<Product> findByStoreIdOrderByNameAsc(UUID storeId);

    Optional<Product> findByIdAndStoreId(UUID id, UUID storeId);
}
```

Crie `backend/src/main/java/com/edgeai/industrial/repository/ShelfSlotRepository.java`:

```java
package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.ShelfSlot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ShelfSlotRepository extends JpaRepository<ShelfSlot, UUID> {

    Optional<ShelfSlot> findByDeviceIdAndSlotIndex(UUID deviceId, Short slotIndex);

    @Query("""
            SELECT s FROM ShelfSlot s, Device d
            WHERE s.deviceId = d.id AND d.storeId = :storeId
            ORDER BY s.slotIndex ASC
            """)
    List<ShelfSlot> findByStoreId(UUID storeId);

    @Query("""
            SELECT s FROM ShelfSlot s, Device d
            WHERE s.id = :id AND s.deviceId = d.id AND d.storeId = :storeId
            """)
    Optional<ShelfSlot> findByIdAndStoreId(UUID id, UUID storeId);
}
```

- [ ] **Step 6: Run the full suite**

```powershell
cd backend
.\gradlew.bat test
```

Esperado: PASS, incluindo os 2 testes novos de `ShelfSlotTest`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/edgeai/industrial/domain backend/src/main/java/com/edgeai/industrial/repository backend/src/test/java/com/edgeai/industrial/domain/ShelfSlotTest.java
git commit -m "feat(backend): add Store, Product and ShelfSlot entities with repositories"
```

---

### Task 4: ShelfService e inversão do pick event

Aqui o backend assume a decisão que hoje é do firmware.

**Files:**
- Create: `backend/src/main/java/com/edgeai/industrial/service/ShelfService.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/dto/SensorPayloadDto.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/service/SensorService.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/repository/PickEventRepository.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/service/PickService.java`
- Test: `backend/src/test/java/com/edgeai/industrial/service/ShelfServiceTest.java`
- Test: `backend/src/test/java/com/edgeai/industrial/service/SensorServiceTest.java` (atualizar)

**Interfaces:**
- Consumes: `ShelfCalculator.compute`, `ShelfCalculator.nextQty`, `ShelfCalculator.toGrams` (Task 1); `ShelfSlotRepository`, `ProductRepository`, `ShelfSlot`, `Product`, `Device.getStoreId()` (Task 3); `DeviceRepository.findById` (já existente).
- Produces:
  - `ShelfService.processWeight(UUID deviceId, OffsetDateTime time, double weightG, boolean stable)`
  - `PickEventRepository.saveDerived(UUID deviceId, OffsetDateTime time, UUID storeId, UUID productId, String productName, int quantity, double weightDeltaKg, double confidence)`
  - `SensorPayloadDto.Sensors.getWeightStable()` → `Boolean`

- [ ] **Step 1: Write the failing test**

Crie `backend/src/test/java/com/edgeai/industrial/service/ShelfServiceTest.java`:

```java
package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.domain.ShelfSlot;
import com.edgeai.industrial.repository.DeviceRepository;
import com.edgeai.industrial.repository.PickEventRepository;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.repository.ShelfSlotRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ShelfServiceTest {

    @Mock private ShelfSlotRepository shelfSlotRepository;
    @Mock private ProductRepository productRepository;
    @Mock private PickEventRepository pickEventRepository;
    @Mock private DeviceRepository deviceRepository;

    @InjectMocks private ShelfService shelfService;

    private UUID deviceId;
    private UUID storeId;
    private UUID productId;
    private OffsetDateTime now;

    @BeforeEach
    void setUp() {
        deviceId = UUID.randomUUID();
        storeId = UUID.randomUUID();
        productId = UUID.randomUUID();
        now = OffsetDateTime.now();
    }

    private Product product() {
        Product p = new Product();
        p.setId(productId);
        p.setStoreId(storeId);
        p.setName("Arroz 1kg");
        p.setUnitWeightG(1000.0);
        p.setToleranceG(15.0);
        return p;
    }

    private ShelfSlot slot(Integer currentQty) {
        ShelfSlot s = new ShelfSlot();
        s.setId(UUID.randomUUID());
        s.setDeviceId(deviceId);
        s.setSlotIndex((short) 0);
        s.setProductId(productId);
        s.setTareG(200.0);
        s.setCurrentQty(currentQty);
        return s;
    }

    private Device device(UUID ownerStoreId) {
        Device d = new Device();
        d.setId(deviceId);
        d.setName("wokwi-shelf-001");
        d.setStoreId(ownerStoreId);
        return d;
    }

    private void wire(ShelfSlot s) {
        when(shelfSlotRepository.findByDeviceIdAndSlotIndex(deviceId, (short) 0))
                .thenReturn(Optional.of(s));
        when(productRepository.findById(productId)).thenReturn(Optional.of(product()));
        when(deviceRepository.findById(deviceId)).thenReturn(Optional.of(device(storeId)));
    }

    @Test
    void unstableReadingIsIgnoredEntirely() {
        shelfService.processWeight(deviceId, now, 5200.0, false);

        verifyNoInteractions(shelfSlotRepository, productRepository, pickEventRepository);
    }

    @Test
    void unconfiguredSlotNeverInventsPickEvent() {
        ShelfSlot s = slot(5);
        s.setProductId(null);
        when(shelfSlotRepository.findByDeviceIdAndSlotIndex(deviceId, (short) 0))
                .thenReturn(Optional.of(s));

        shelfService.processWeight(deviceId, now, 5200.0, true);

        verifyNoInteractions(pickEventRepository);
    }

    @Test
    void firstReadingInitializesQuantityWithoutPickEvent() {
        wire(slot(null));

        shelfService.processWeight(deviceId, now, 5200.0, true);  // 5000g liquido = 5 unidades

        ArgumentCaptor<ShelfSlot> captor = ArgumentCaptor.forClass(ShelfSlot.class);
        verify(shelfSlotRepository).save(captor.capture());
        assertEquals(5, captor.getValue().getCurrentQty());
        verifyNoInteractions(pickEventRepository);
    }

    @Test
    void weightDropGeneratesPickEventWithTheDifference() {
        wire(slot(5));

        shelfService.processWeight(deviceId, now, 3200.0, true);  // 3000g = 3 unidades

        verify(pickEventRepository).saveDerived(
                eq(deviceId), eq(now), eq(storeId), eq(productId),
                eq("Arroz 1kg"), eq(2), anyDouble(), anyDouble());
    }

    @Test
    void weightRiseIsRestockAndGeneratesNoPickEvent() {
        wire(slot(5));

        shelfService.processWeight(deviceId, now, 8200.0, true);  // 8000g = 8 unidades

        ArgumentCaptor<ShelfSlot> captor = ArgumentCaptor.forClass(ShelfSlot.class);
        verify(shelfSlotRepository).save(captor.capture());
        assertEquals(8, captor.getValue().getCurrentQty());
        verifyNoInteractions(pickEventRepository);
    }

    @Test
    void noiseInsideDeadbandKeepsQuantityAndGeneratesNoPickEvent() {
        wire(slot(5));

        shelfService.processWeight(deviceId, now, 4900.0, true);  // 4700g = 4.7 unidades

        ArgumentCaptor<ShelfSlot> captor = ArgumentCaptor.forClass(ShelfSlot.class);
        verify(shelfSlotRepository).save(captor.capture());
        assertEquals(5, captor.getValue().getCurrentQty());
        verifyNoInteractions(pickEventRepository);
    }

    @Test
    void weightBelowTareSaturatesAtZeroAndMarksSuspect() {
        wire(slot(5));

        shelfService.processWeight(deviceId, now, 50.0, true);  // abaixo da tara de 200g

        ArgumentCaptor<ShelfSlot> captor = ArgumentCaptor.forClass(ShelfSlot.class);
        verify(shelfSlotRepository).save(captor.capture());
        assertEquals(0, captor.getValue().getCurrentQty());
        assertTrue(captor.getValue().getSuspect());
    }

    @Test
    void deviceFromAnotherStoreIsRejectedAtConsumption() {
        ShelfSlot s = slot(5);
        when(shelfSlotRepository.findByDeviceIdAndSlotIndex(deviceId, (short) 0))
                .thenReturn(Optional.of(s));
        when(productRepository.findById(productId)).thenReturn(Optional.of(product()));
        when(deviceRepository.findById(deviceId))
                .thenReturn(Optional.of(device(UUID.randomUUID())));  // outra loja

        shelfService.processWeight(deviceId, now, 3200.0, true);

        verify(shelfSlotRepository, never()).save(any());
        verifyNoInteractions(pickEventRepository);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.service.ShelfServiceTest"
```

Esperado: FAIL na compilação — `cannot find symbol: class ShelfService`.

- [ ] **Step 3: Add the repository write method**

Em `backend/src/main/java/com/edgeai/industrial/repository/PickEventRepository.java`, **substitua** o método `save(...)` existente por:

```java
    public void saveDerived(UUID deviceId, OffsetDateTime time, UUID storeId, UUID productId,
                            String productName, int quantity, double weightDeltaKg, double confidence) {
        jdbc.update("""
                INSERT INTO pick_events
                    (time, device_id, store_id, product_id, product_name, quantity, weight_delta_kg, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                Timestamp.from(time.toInstant()),
                deviceId,
                storeId,
                productId,
                productName,
                quantity,
                weightDeltaKg,
                confidence);
    }
```

Remova o import agora não utilizado de `SensorPayloadDto` no topo do arquivo.

- [ ] **Step 4: Write ShelfService**

Crie `backend/src/main/java/com/edgeai/industrial/service/ShelfService.java`:

```java
package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.domain.ShelfSlot;
import com.edgeai.industrial.repository.DeviceRepository;
import com.edgeai.industrial.repository.PickEventRepository;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.repository.ShelfSlotRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Owns the business rule the firmware used to own: which product sits on a
 * shelf, how many units are left, and whether a drop is a real pick.
 */
@Service
@RequiredArgsConstructor
public class ShelfService {

    private static final Short DEFAULT_SLOT = 0;

    private final ShelfSlotRepository shelfSlotRepository;
    private final ProductRepository productRepository;
    private final PickEventRepository pickEventRepository;
    private final DeviceRepository deviceRepository;

    @Transactional
    public void processWeight(UUID deviceId, OffsetDateTime time, double weightG, boolean stable) {
        if (!stable) {
            return;
        }

        Optional<ShelfSlot> maybeSlot = shelfSlotRepository.findByDeviceIdAndSlotIndex(deviceId, DEFAULT_SLOT);
        if (maybeSlot.isEmpty()) {
            return;
        }
        ShelfSlot slot = maybeSlot.get();
        if (slot.getProductId() == null) {
            return;
        }

        Optional<Product> maybeProduct = productRepository.findById(slot.getProductId());
        if (maybeProduct.isEmpty()) {
            return;
        }
        Product product = maybeProduct.get();

        // A device may only feed slots of its own store. Rejected at consumption,
        // not at the controller — the MQTT path never passes through one.
        boolean sameStore = deviceRepository.findById(deviceId)
                .map(d -> product.getStoreId().equals(d.getStoreId()))
                .orElse(false);
        if (!sameStore) {
            return;
        }

        ShelfCalculator.Result result = ShelfCalculator.compute(
                weightG, slot.getTareG(), product.getUnitWeightG(), product.getToleranceG());

        Integer previousQty = slot.getCurrentQty();
        int nextQty = ShelfCalculator.nextQty(previousQty, result.rawUnits());

        slot.setCurrentWeightG(weightG);
        slot.setCurrentQty(nextQty);
        slot.setSuspect(result.suspect());
        shelfSlotRepository.save(slot);

        if (previousQty != null && nextQty < previousQty) {
            int picked = previousQty - nextQty;
            double weightDeltaKg = picked * product.getUnitWeightG() / 1000.0;
            pickEventRepository.saveDerived(deviceId, time, product.getStoreId(), product.getId(),
                    product.getName(), picked, weightDeltaKg, result.confidence());
        }
    }
}
```

- [ ] **Step 5: Run the new test to verify it passes**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.service.ShelfServiceTest"
```

Esperado: PASS, 8 testes.

- [ ] **Step 6: Add weight_stable to the payload DTO**

Em `backend/src/main/java/com/edgeai/industrial/dto/SensorPayloadDto.java`, dentro da classe interna `Sensors`, adicione:

```java
        @JsonProperty("weight_stable")
        private Boolean weightStable;
```

**Não remova** a classe interna `PickEvent` nem o campo `pickEvent` ainda — payloads antigos em trânsito ainda podem trazê-los, e desserializar deve continuar funcionando. Eles simplesmente deixam de ser lidos.

- [ ] **Step 7: Wire ShelfService into SensorService**

Em `backend/src/main/java/com/edgeai/industrial/service/SensorService.java`:

Troque a dependência `PickService` por `ShelfService`:

```java
    private final SensorDataRepository sensorDataRepository;
    private final ShelfService shelfService;
```

**Substitua** o bloco do peso e o bloco do pick event por:

```java
        if (s.getWeight() != null) {
            sensorDataRepository.insert(time, device.getId(), device.getName(),
                    "weight", s.getWeight().getValue(), s.getWeight().getUnit(),
                    classification, anomalyScore);

            double weightG = ShelfCalculator.toGrams(s.getWeight().getValue(), s.getWeight().getUnit());
            boolean stable = !Boolean.FALSE.equals(s.getWeightStable());
            shelfService.processWeight(device.getId(), time, weightG, stable);
        }
```

Remova o import de `SensorPayloadDto.PickEvent` se houver, e o bloco `if (payload.getPickEvent() != null ...)`.

Em `backend/src/main/java/com/edgeai/industrial/service/PickService.java`, remova o método `savePickEvent(...)`. Os métodos de leitura `getRecentPicks` e `getProductDemand` permanecem — a página `/dashboard/picks` depende deles.

- [ ] **Step 8: Update SensorServiceTest**

Em `backend/src/test/java/com/edgeai/industrial/service/SensorServiceTest.java`:

Troque o mock:

```java
    @Mock
    private ShelfService shelfService;
```

Remova o `@Mock private PickService pickService;` e o método `makePayload`'s parâmetro de pick event não precisa mudar. Substitua os três testes existentes por:

```java
    @Test
    void saveSensorPayloadInsertsFourRowsWithWeight() {
        Device device = makeDevice();
        SensorPayloadDto payload = makePayload(true, false);

        sensorService.saveSensorPayload(device, payload);

        verify(sensorDataRepository, times(4)).insert(
                any(), eq(device.getId()), eq(device.getName()),
                any(), anyDouble(), any(), eq("normal"), eq(0.05)
        );
    }

    @Test
    void saveSensorPayloadInsertsThreeRowsWithoutWeight() {
        Device device = makeDevice();
        SensorPayloadDto payload = makePayload(false, false);

        sensorService.saveSensorPayload(device, payload);

        verify(sensorDataRepository, times(3)).insert(
                any(), eq(device.getId()), eq(device.getName()),
                any(), anyDouble(), any(), eq("normal"), eq(0.05)
        );
        verifyNoInteractions(shelfService);
    }

    @Test
    void saveSensorPayloadForwardsWeightInGramsToShelfService() {
        Device device = makeDevice();
        SensorPayloadDto payload = makePayload(true, false);

        sensorService.saveSensorPayload(device, payload);

        // o payload de teste traz 4.75 kg
        verify(shelfService, times(1)).processWeight(
                eq(device.getId()), any(OffsetDateTime.class), eq(4750.0), eq(true));
    }

    @Test
    void saveSensorPayloadIgnoresLegacyPickEventBlock() {
        Device device = makeDevice();
        SensorPayloadDto payload = makePayload(true, true);

        sensorService.saveSensorPayload(device, payload);

        // o bloco pick_event antigo nao gera mais nada por si so
        verify(shelfService, times(1)).processWeight(
                eq(device.getId()), any(OffsetDateTime.class), eq(4750.0), eq(true));
    }
```

- [ ] **Step 9: Run the full suite**

```powershell
cd backend
.\gradlew.bat test
```

Esperado: PASS em toda a suíte.

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java backend/src/test/java
git commit -m "feat(backend): move pick decision from firmware to ShelfService"
```

---

### Task 5: Escopo de loja

O `store_id` vai no JWT (útil para o front), mas a **autorização deriva do usuário carregado do banco** — token não é fonte de verdade para permissão.

**Files:**
- Create: `backend/src/main/java/com/edgeai/industrial/security/StoreUserDetails.java`
- Create: `backend/src/main/java/com/edgeai/industrial/security/CurrentStore.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/security/UserDetailsServiceImpl.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/security/JwtService.java`
- Modify: `backend/src/main/java/com/edgeai/industrial/controller/AuthController.java`
- Test: `backend/src/test/java/com/edgeai/industrial/security/JwtServiceTest.java` (adicionar)

**Interfaces:**
- Consumes: `User.getStoreId()` (Task 3).
- Produces:
  - `StoreUserDetails` extends `org.springframework.security.core.userdetails.User`, com `getStoreId()` → `UUID`
  - `CurrentStore.id()` → `UUID` (estático; lança `IllegalStateException` se não houver usuário autenticado)
  - `JwtService.generateToken(String email, UUID storeId)` e `JwtService.extractStoreId(String token)` → `UUID`

- [ ] **Step 1: Write the failing test**

Adicione a `backend/src/test/java/com/edgeai/industrial/security/JwtServiceTest.java`:

```java
    @Test
    void tokenCarriesStoreIdClaim() {
        java.util.UUID storeId = java.util.UUID.randomUUID();
        String token = jwtService.generateToken("admin@edgeai.local", storeId);

        assertEquals(storeId, jwtService.extractStoreId(token));
        assertEquals("admin@edgeai.local", jwtService.extractEmail(token));
    }

    @Test
    void tokenWithoutStoreIdReturnsNull() {
        String token = jwtService.generateToken("admin@edgeai.local", null);

        assertNull(jwtService.extractStoreId(token));
    }
```

Se o arquivo ainda não importa `org.junit.jupiter.api.Assertions.assertNull`, use o import estático `import static org.junit.jupiter.api.Assertions.*;`.

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.security.JwtServiceTest"
```

Esperado: FAIL na compilação — `method generateToken cannot be applied to given types`.

- [ ] **Step 3: Extend JwtService**

Em `backend/src/main/java/com/edgeai/industrial/security/JwtService.java`, **substitua** `generateToken` e adicione `extractStoreId`:

```java
    public String generateToken(String email, UUID storeId) {
        var builder = Jwts.builder()
                .subject(email)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs));
        if (storeId != null) {
            builder.claim("store_id", storeId.toString());
        }
        return builder.signWith(key).compact();
    }

    public UUID extractStoreId(String token) {
        String raw = parseClaims(token).get("store_id", String.class);
        return raw == null ? null : UUID.fromString(raw);
    }
```

Adicione `import java.util.UUID;` ao topo.

- [ ] **Step 4: Create StoreUserDetails and CurrentStore**

Crie `backend/src/main/java/com/edgeai/industrial/security/StoreUserDetails.java`:

```java
package com.edgeai.industrial.security;

import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;

import java.util.Collection;
import java.util.UUID;

/** UserDetails that carries the store the user belongs to. */
@Getter
public class StoreUserDetails extends org.springframework.security.core.userdetails.User {

    private final UUID storeId;

    public StoreUserDetails(String username, String password,
                            Collection<? extends GrantedAuthority> authorities,
                            UUID storeId) {
        super(username, password, authorities);
        this.storeId = storeId;
    }
}
```

Crie `backend/src/main/java/com/edgeai/industrial/security/CurrentStore.java`:

```java
package com.edgeai.industrial.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

/** Reads the authenticated user's store from the security context. */
public final class CurrentStore {

    private CurrentStore() {
    }

    public static UUID id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof StoreUserDetails details)) {
            throw new IllegalStateException("No authenticated store user in context");
        }
        return details.getStoreId();
    }
}
```

- [ ] **Step 5: Return StoreUserDetails from UserDetailsServiceImpl**

Em `backend/src/main/java/com/edgeai/industrial/security/UserDetailsServiceImpl.java`, substitua o corpo de `loadUserByUsername`:

```java
    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return userRepository.findByEmail(email)
                .map(user -> (UserDetails) new StoreUserDetails(
                        user.getEmail(),
                        user.getPasswordHash(),
                        List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().toUpperCase())),
                        user.getStoreId()
                ))
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + email));
    }
```

- [ ] **Step 6: Put the store in the token at login**

Em `backend/src/main/java/com/edgeai/industrial/controller/AuthController.java`, substitua a linha de geração do token:

```java
            UUID storeId = null;
            if (auth.getPrincipal() instanceof StoreUserDetails details) {
                storeId = details.getStoreId();
            }
            String token = jwtService.generateToken(auth.getName(), storeId);
```

Adicione os imports `com.edgeai.industrial.security.StoreUserDetails` e `java.util.UUID`.

- [ ] **Step 7: Run the full suite**

```powershell
cd backend
.\gradlew.bat test
```

Esperado: PASS. Se `AuthControllerTest` quebrar por causa da assinatura de `generateToken`, ajuste a chamada no teste para passar `null` como `storeId`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/edgeai/industrial/security backend/src/main/java/com/edgeai/industrial/controller/AuthController.java backend/src/test/java/com/edgeai/industrial/security/JwtServiceTest.java
git commit -m "feat(backend): scope authenticated users to a store"
```

---

### Task 6: API de produtos e slots

**Files:**
- Create: `backend/src/main/java/com/edgeai/industrial/dto/ProductDto.java`
- Create: `backend/src/main/java/com/edgeai/industrial/dto/ShelfSlotDto.java`
- Create: `backend/src/main/java/com/edgeai/industrial/controller/ProductController.java`
- Create: `backend/src/main/java/com/edgeai/industrial/controller/ShelfSlotController.java`
- Create: `backend/src/main/java/com/edgeai/industrial/controller/StoreController.java`
- Test: `backend/src/test/java/com/edgeai/industrial/controller/ProductControllerTest.java`

**Interfaces:**
- Consumes: `ProductRepository`, `ShelfSlotRepository`, `Product`, `ShelfSlot` (Task 3); `CurrentStore.id()` (Task 5).
- Produces:
  - `ProductDto(UUID id, String name, String sku, Double unitWeightG, Double toleranceG, Integer unitPriceCents, Boolean active)`
  - `ShelfSlotDto(UUID id, UUID deviceId, Short slotIndex, UUID productId, String productName, Double tareG, Integer minQty, Integer currentQty, Double currentWeightG, Boolean suspect)`

- [ ] **Step 1: Write the failing test**

Crie `backend/src/test/java/com/edgeai/industrial/controller/ProductControllerTest.java`:

```java
package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.dto.ProductDto;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.security.StoreUserDetails;
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
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductControllerTest {

    @Mock private ProductRepository productRepository;
    @InjectMocks private ProductController productController;

    private UUID storeA;
    private UUID storeB;

    @BeforeEach
    void setUp() {
        storeA = UUID.randomUUID();
        storeB = UUID.randomUUID();
        authenticateAs(storeA);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(UUID storeId) {
        StoreUserDetails principal = new StoreUserDetails(
                "user@loja.local", "hash",
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")), storeId);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    @Test
    void listReturnsOnlyProductsOfTheAuthenticatedStore() {
        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setStoreId(storeA);
        p.setName("Arroz 1kg");
        p.setUnitWeightG(1000.0);
        p.setToleranceG(15.0);
        when(productRepository.findByStoreIdOrderByNameAsc(storeA)).thenReturn(List.of(p));

        List<ProductDto> result = productController.list();

        assertEquals(1, result.size());
        assertEquals("Arroz 1kg", result.get(0).name());
        verify(productRepository).findByStoreIdOrderByNameAsc(storeA);
    }

    @Test
    void createStampsTheAuthenticatedStoreOnTheProduct() {
        when(productRepository.save(any(Product.class))).thenAnswer(inv -> {
            Product saved = inv.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        ProductDto body = new ProductDto(null, "Feijao 1kg", "FJO-1KG", 1000.0, 15.0, 890, true);
        ProductDto created = productController.create(body);

        assertNotNull(created.id());
        assertEquals("Feijao 1kg", created.name());
    }

    @Test
    void productFromAnotherStoreIsNotFound() {
        UUID otherId = UUID.randomUUID();
        when(productRepository.findByIdAndStoreId(otherId, storeA)).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> productController.update(otherId,
                new ProductDto(null, "X", null, 100.0, 5.0, null, true)));
    }

    @Test
    void listUsesTheStoreOfWhoeverIsAuthenticated() {
        authenticateAs(storeB);
        when(productRepository.findByStoreIdOrderByNameAsc(storeB)).thenReturn(List.of());

        assertTrue(productController.list().isEmpty());
        verify(productRepository, never()).findByStoreIdOrderByNameAsc(storeA);
    }
}
```

O import necessário para as asserções acima é `org.springframework.web.server.ResponseStatusException`.

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd backend
.\gradlew.bat test --tests "com.edgeai.industrial.controller.ProductControllerTest"
```

Esperado: FAIL na compilação — `cannot find symbol: class ProductController`.

- [ ] **Step 3: Write the DTOs**

Crie `backend/src/main/java/com/edgeai/industrial/dto/ProductDto.java`:

```java
package com.edgeai.industrial.dto;

import java.util.UUID;

public record ProductDto(
        UUID id,
        String name,
        String sku,
        Double unitWeightG,
        Double toleranceG,
        Integer unitPriceCents,
        Boolean active
) {
}
```

Crie `backend/src/main/java/com/edgeai/industrial/dto/ShelfSlotDto.java`:

```java
package com.edgeai.industrial.dto;

import java.util.UUID;

public record ShelfSlotDto(
        UUID id,
        UUID deviceId,
        Short slotIndex,
        UUID productId,
        String productName,
        Double tareG,
        Integer minQty,
        Integer currentQty,
        Double currentWeightG,
        Boolean suspect
) {
}
```

- [ ] **Step 4: Write ProductController**

Crie `backend/src/main/java/com/edgeai/industrial/controller/ProductController.java`:

```java
package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.dto.ProductDto;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.security.CurrentStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/products")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ProductController {

    private final ProductRepository productRepository;

    @GetMapping
    public List<ProductDto> list() {
        return productRepository.findByStoreIdOrderByNameAsc(CurrentStore.id())
                .stream().map(ProductController::toDto).toList();
    }

    @PostMapping
    public ProductDto create(@RequestBody ProductDto body) {
        validate(body);
        Product product = new Product();
        product.setStoreId(CurrentStore.id());
        apply(product, body);
        return toDto(productRepository.save(product));
    }

    @PutMapping("/{id}")
    public ProductDto update(@PathVariable UUID id, @RequestBody ProductDto body) {
        validate(body);
        Product product = productRepository.findByIdAndStoreId(id, CurrentStore.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Produto nao encontrado"));
        apply(product, body);
        return toDto(productRepository.save(product));
    }

    @DeleteMapping("/{id}")
    public void deactivate(@PathVariable UUID id) {
        Product product = productRepository.findByIdAndStoreId(id, CurrentStore.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Produto nao encontrado"));
        product.setActive(false);
        productRepository.save(product);
    }

    private static void validate(ProductDto body) {
        if (body.name() == null || body.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nome do produto e obrigatorio");
        }
        if (body.unitWeightG() == null || body.unitWeightG() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Peso unitario deve ser maior que zero");
        }
    }

    private static void apply(Product product, ProductDto body) {
        product.setName(body.name());
        product.setSku(body.sku());
        product.setUnitWeightG(body.unitWeightG());
        product.setToleranceG(body.toleranceG() == null ? 5.0 : body.toleranceG());
        product.setUnitPriceCents(body.unitPriceCents());
        product.setActive(body.active() == null || body.active());
    }

    private static ProductDto toDto(Product p) {
        return new ProductDto(p.getId(), p.getName(), p.getSku(), p.getUnitWeightG(),
                p.getToleranceG(), p.getUnitPriceCents(), p.getActive());
    }
}
```

- [ ] **Step 5: Write ShelfSlotController**

Crie `backend/src/main/java/com/edgeai/industrial/controller/ShelfSlotController.java`:

```java
package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.domain.ShelfSlot;
import com.edgeai.industrial.dto.ShelfSlotDto;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.repository.ShelfSlotRepository;
import com.edgeai.industrial.security.CurrentStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/shelf-slots")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ShelfSlotController {

    private final ShelfSlotRepository shelfSlotRepository;
    private final ProductRepository productRepository;

    @GetMapping
    public List<ShelfSlotDto> list() {
        UUID storeId = CurrentStore.id();
        return shelfSlotRepository.findByStoreId(storeId).stream()
                .map(slot -> toDto(slot, productName(slot, storeId)))
                .toList();
    }

    @PutMapping("/{id}")
    public ShelfSlotDto update(@PathVariable UUID id, @RequestBody ShelfSlotDto body) {
        UUID storeId = CurrentStore.id();
        ShelfSlot slot = shelfSlotRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Slot nao encontrado"));

        if (body.productId() != null) {
            productRepository.findByIdAndStoreId(body.productId(), storeId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Produto de outra loja"));
        }
        slot.setProductId(body.productId());
        if (body.minQty() != null) {
            slot.setMinQty(body.minQty());
        }
        // Trocar de produto invalida a contagem anterior.
        slot.setCurrentQty(null);
        shelfSlotRepository.save(slot);
        return toDto(slot, productName(slot, storeId));
    }

    /** Zera o slot com a prateleira vazia: o peso atual vira a tara. */
    @PostMapping("/{id}/tare")
    public ShelfSlotDto tare(@PathVariable UUID id) {
        UUID storeId = CurrentStore.id();
        ShelfSlot slot = shelfSlotRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Slot nao encontrado"));
        if (slot.getCurrentWeightG() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Sem leitura de peso para usar como tara");
        }
        slot.setTareG(slot.getCurrentWeightG());
        slot.setCurrentQty(0);
        slot.setSuspect(false);
        shelfSlotRepository.save(slot);
        return toDto(slot, productName(slot, storeId));
    }

    private String productName(ShelfSlot slot, UUID storeId) {
        if (slot.getProductId() == null) {
            return null;
        }
        return productRepository.findByIdAndStoreId(slot.getProductId(), storeId)
                .map(Product::getName).orElse(null);
    }

    private static ShelfSlotDto toDto(ShelfSlot s, String productName) {
        return new ShelfSlotDto(s.getId(), s.getDeviceId(), s.getSlotIndex(), s.getProductId(),
                productName, s.getTareG(), s.getMinQty(), s.getCurrentQty(),
                s.getCurrentWeightG(), s.getSuspect());
    }
}
```

- [ ] **Step 6: Write StoreController**

Crie `backend/src/main/java/com/edgeai/industrial/controller/StoreController.java`:

```java
package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Store;
import com.edgeai.industrial.repository.StoreRepository;
import com.edgeai.industrial.security.CurrentStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/stores")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class StoreController {

    private final StoreRepository storeRepository;

    @GetMapping("/me")
    public Map<String, Object> me() {
        Store store = storeRepository.findById(CurrentStore.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
        return Map.of(
                "id", store.getId(),
                "name", store.getName(),
                "timezone", store.getTimezone()
        );
    }
}
```

- [ ] **Step 7: Run the full suite**

```powershell
cd backend
.\gradlew.bat test
```

Esperado: PASS.

- [ ] **Step 8: Manual smoke test**

Suba o backend e valide o isolamento na prática:

```powershell
cd backend
.\gradlew.bat bootRun
```

Em outro terminal:

```powershell
$token = (Invoke-RestMethod -Uri http://localhost:8082/api/auth/login -Method Post -ContentType 'application/json' -Body '{"email":"admin@edgeai.local","password":"admin123"}').token
Invoke-RestMethod -Uri http://localhost:8082/api/products -Headers @{Authorization="Bearer $token"}
```

Esperado: os 4 produtos do seed.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/edgeai/industrial/dto backend/src/main/java/com/edgeai/industrial/controller backend/src/test/java/com/edgeai/industrial/controller/ProductControllerTest.java
git commit -m "feat(backend): add product and shelf slot REST APIs scoped by store"
```

---

### Task 7: Tela de configuração no dashboard

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/apiClient.ts`
- Modify: `frontend/src/app/dashboard/layout.tsx`
- Create: `frontend/src/app/dashboard/settings/page.tsx`
- Create: `frontend/src/components/ProductForm.tsx`
- Create: `frontend/src/components/ShelfSlotTable.tsx`

**Interfaces:**
- Consumes: `GET/POST/PUT /api/products`, `GET/PUT /api/shelf-slots`, `POST /api/shelf-slots/{id}/tare` (Task 6).
- Produces: tipos `Product` e `ShelfSlot` em `@/types`; métodos `apiClient.getProducts`, `createProduct`, `updateProduct`, `getShelfSlots`, `updateShelfSlot`, `tareShelfSlot`.

- [ ] **Step 1: Add the types**

Em `frontend/src/types/index.ts`, adicione ao final:

```typescript
export interface Product {
  id: string;
  name: string;
  sku: string | null;
  unitWeightG: number;
  toleranceG: number;
  unitPriceCents: number | null;
  active: boolean;
}

export interface ShelfSlot {
  id: string;
  deviceId: string;
  slotIndex: number;
  productId: string | null;
  productName: string | null;
  tareG: number;
  minQty: number;
  currentQty: number | null;
  currentWeightG: number | null;
  suspect: boolean;
}
```

- [ ] **Step 2: Add the apiClient methods**

Em `frontend/src/services/apiClient.ts`, dentro do objeto `apiClient`, adicione:

```typescript
  getProducts: () => request<import('@/types').Product[]>('/products'),
  createProduct: (body: Omit<import('@/types').Product, 'id'>) =>
    request<import('@/types').Product>('/products', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProduct: (id: string, body: Omit<import('@/types').Product, 'id'>) =>
    request<import('@/types').Product>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getShelfSlots: () => request<import('@/types').ShelfSlot[]>('/shelf-slots'),
  updateShelfSlot: (id: string, body: { productId: string | null; minQty: number }) =>
    request<import('@/types').ShelfSlot>(`/shelf-slots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  tareShelfSlot: (id: string) =>
    request<import('@/types').ShelfSlot>(`/shelf-slots/${id}/tare`, { method: 'POST' }),
```

- [ ] **Step 3: Create ProductForm**

Crie `frontend/src/components/ProductForm.tsx`:

```tsx
'use client';

import { useState } from 'react';

interface Props {
  onCreate: (body: {
    name: string;
    sku: string | null;
    unitWeightG: number;
    toleranceG: number;
    unitPriceCents: number | null;
    active: boolean;
  }) => Promise<void>;
}

export function ProductForm({ onCreate }: Props) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unitWeightG, setUnitWeightG] = useState('');
  const [priceReais, setPriceReais] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const weight = Number(unitWeightG);
    if (!name.trim()) return setError('Informe o nome do produto.');
    if (!Number.isFinite(weight) || weight <= 0) return setError('Peso unitário deve ser maior que zero.');

    setSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        sku: sku.trim() || null,
        unitWeightG: weight,
        toleranceG: 5,
        unitPriceCents: priceReais ? Math.round(Number(priceReais) * 100) : null,
        active: true,
      });
      setName(''); setSku(''); setUnitWeightG(''); setPriceReais('');
    } catch {
      setError('Não foi possível salvar o produto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor="product-name" className="text-xs text-gray-400">Nome</label>
        <input id="product-name" value={name} onChange={(e) => setName(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-sku" className="text-xs text-gray-400">SKU</label>
        <input id="product-sku" value={sku} onChange={(e) => setSku(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-weight" className="text-xs text-gray-400">Peso unitário (g)</label>
        <input id="product-weight" value={unitWeightG} onChange={(e) => setUnitWeightG(e.target.value)}
          inputMode="decimal"
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-price" className="text-xs text-gray-400">Preço (R$)</label>
        <input id="product-price" value={priceReais} onChange={(e) => setPriceReais(e.target.value)}
          inputMode="decimal"
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white" />
      </div>
      <button type="submit" disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded px-3 py-1.5">
        {saving ? 'Salvando...' : 'Adicionar produto'}
      </button>
      {error && <p role="alert" className="text-red-400 text-sm w-full">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Create ShelfSlotTable**

Crie `frontend/src/components/ShelfSlotTable.tsx`:

```tsx
'use client';

import { Product, ShelfSlot } from '@/types';

interface Props {
  slots: ShelfSlot[];
  products: Product[];
  onBind: (slotId: string, productId: string | null, minQty: number) => void;
  onTare: (slotId: string) => void;
}

export function ShelfSlotTable({ slots, products, onBind, onTare }: Props) {
  if (slots.length === 0) {
    return <p className="text-gray-400 text-sm">Nenhuma prateleira registrada ainda.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-400 border-b border-gray-700">
          <th className="py-2">Prateleira</th>
          <th className="py-2">Produto</th>
          <th className="py-2">Estoque mínimo</th>
          <th className="py-2">Estoque atual</th>
          <th className="py-2">Tara (g)</th>
          <th className="py-2">Ações</th>
        </tr>
      </thead>
      <tbody>
        {slots.map((slot) => (
          <tr key={slot.id} className="border-b border-gray-800 text-gray-200">
            <td className="py-2">#{slot.slotIndex}</td>
            <td className="py-2">
              <label htmlFor={`slot-product-${slot.id}`} className="sr-only">
                Produto da prateleira {slot.slotIndex}
              </label>
              <select
                id={`slot-product-${slot.id}`}
                value={slot.productId ?? ''}
                onChange={(e) => onBind(slot.id, e.target.value || null, slot.minQty)}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
              >
                <option value="">Não configurado</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </td>
            <td className="py-2">
              <label htmlFor={`slot-min-${slot.id}`} className="sr-only">
                Estoque mínimo da prateleira {slot.slotIndex}
              </label>
              <input
                id={`slot-min-${slot.id}`}
                type="number"
                min={0}
                defaultValue={slot.minQty}
                onBlur={(e) => onBind(slot.id, slot.productId, Number(e.target.value))}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm w-20"
              />
            </td>
            <td className="py-2">
              {slot.currentQty ?? '—'}
              {slot.suspect && (
                <span className="ml-2 text-yellow-400 text-xs">leitura suspeita</span>
              )}
            </td>
            <td className="py-2">{slot.tareG.toFixed(0)}</td>
            <td className="py-2">
              <button
                onClick={() => onTare(slot.id)}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs rounded px-2 py-1"
              >
                Tarar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Create the settings page**

Crie `frontend/src/app/dashboard/settings/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Product, ShelfSlot } from '@/types';
import { apiClient } from '@/services/apiClient';
import { ProductForm } from '@/components/ProductForm';
import { ShelfSlotTable } from '@/components/ShelfSlotTable';

export default function SettingsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [slots, setSlots] = useState<ShelfSlot[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    return Promise.all([apiClient.getProducts(), apiClient.getShelfSlots()])
      .then(([p, s]) => {
        setProducts(p);
        setSlots(s);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCreate(body: Omit<Product, 'id'>) {
    await apiClient.createProduct(body);
    await reload();
  }

  function handleBind(slotId: string, productId: string | null, minQty: number) {
    apiClient.updateShelfSlot(slotId, { productId, minQty }).then(reload).catch(console.error);
  }

  function handleTare(slotId: string) {
    apiClient.tareShelfSlot(slotId).then(reload).catch(console.error);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 text-white">Configuração da Loja</h1>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h2 className="text-sm text-gray-400 mb-4">Produtos</h2>
            <ProductForm onCreate={handleCreate} />
            <ul className="mt-4 flex flex-col gap-1">
              {products.map((p) => (
                <li key={p.id} className="text-sm text-gray-200">
                  {p.name} — {p.unitWeightG}g por unidade
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h2 className="text-sm text-gray-400 mb-4">Prateleiras</h2>
            <ShelfSlotTable
              slots={slots}
              products={products}
              onBind={handleBind}
              onTare={handleTare}
            />
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add the nav link**

Em `frontend/src/app/dashboard/layout.tsx`, adicione após o link de "Retiradas":

```tsx
        <Link href="/dashboard/settings" className="text-sm text-gray-300 hover:text-white py-1">
          Configuração
        </Link>
```

- [ ] **Step 7: Verify the build**

```powershell
cd frontend
npm run build
```

Esperado: build sem erros de TypeScript.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add store settings page for products and shelf slots"
```

---

### Task 8: Payload v2 no simulador e no Wokwi

**Files:**
- Modify: `wokwi/sketch.ino`
- Modify: `firmware/simulator/esp32_sensor_simulator.py`

**Interfaces:**
- Consumes: `SensorPayloadDto.Sensors.weightStable` (Task 4).
- Produces: payload MQTT v2 — `sensors.weight` absoluto com `unit: "kg"`, `sensors.weight_stable` booleano, sem bloco `pick_event`.

- [ ] **Step 1: Remove pick detection from the sketch**

Em `wokwi/sketch.ino`:

Remova as constantes `PICK_THRESHOLD`, a struct `Product`, o array `CATALOG`, a constante `CATALOG_SIZE`, a struct `PickResult` e a função inteira `classifyPick(...)`.

Adicione, junto às demais constantes de peso:

```cpp
const float WEIGHT_STABLE_TOLERANCE_KG = 0.010f;  // 10g entre leituras = estavel
```

- [ ] **Step 2: Publish absolute weight plus stability**

Ainda em `wokwi/sketch.ino`, no `loop()`, **substitua** o bloco `// Pick detection` inteiro por:

```cpp
  // Estabilidade: duas leituras consecutivas dentro da tolerancia.
  bool weightStable = (prevWeight >= 0.0f) &&
                      (fabsf(weight - prevWeight) <= WEIGHT_STABLE_TOLERANCE_KG);
  wgtObj["value"] = round(weight * 1000) / 1000.0;
  wgtObj["unit"]  = "kg";
  sensors["weight_stable"] = weightStable;
  prevWeight = weight;
```

E remova as duas linhas anteriores que já definiam `wgtObj["value"]` e `wgtObj["unit"]`, para não duplicar.

Atualize o log serial:

```cpp
  Serial.printf("[SENSOR] temp=%.1fC vib=%.3f cur=%.2fA wgt=%.3fkg estavel=%d score=%.2f [%s] pub=%s\n",
                temp, vib, cur, weight, weightStable ? 1 : 0, score, cls, ok ? "OK" : "FAIL");
```

- [ ] **Step 3: Verify in Wokwi**

Abra o projeto no Wokwi, rode, e confira no monitor serial que o payload publicado não contém `pick_event` e contém `weight_stable`. Mexa no potenciômetro `pot3`: a primeira leitura após o movimento deve sair com `estavel=0` e a seguinte com `estavel=1`.

- [ ] **Step 4: Add weight to the Python simulator**

Em `firmware/simulator/esp32_sensor_simulator.py`, dentro de `_sensor_payload`, adicione ao dicionário `sensors` (junto de `temperature`, `vibration` e `current`):

```python
                "weight": {"value": snapshot.weight_kg, "unit": "kg"},
                "weight_stable": snapshot.weight_stable,
```

Em `SensorSnapshot`, adicione os campos `weight_kg: float` e `weight_stable: bool`. Em `next_snapshot`, mantenha um peso corrente no gerador que decresce em passos de uma unidade a cada N ciclos (simulando retiradas) e marque `weight_stable=False` exatamente no ciclo em que o peso muda:

```python
        previous = self._weight_kg
        if step % 6 == 0 and self._weight_kg > 1.0:
            self._weight_kg -= 1.0          # uma unidade de 1kg saiu da prateleira
        weight_stable = abs(self._weight_kg - previous) < 0.001
```

Inicialize `self._weight_kg = 8.2` no `__init__` do gerador (8 unidades de 1kg sobre uma bandeja de 200g).

- [ ] **Step 5: Run the end-to-end check**

Com Docker, backend e frontend rodando:

```powershell
cd firmware/simulator
python esp32_sensor_simulator.py --interval 5
```

Depois, no dashboard, vincule o produto "Arroz 1kg" à prateleira em `/dashboard/settings`, ajuste a tara para 200 e observe. Confira no banco:

```powershell
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "SELECT current_qty, current_weight_g, suspect FROM shelf_slots;"
docker exec -i edgeai-postgres psql -U edgeai -d edgeai -c "SELECT time, product_name, quantity, confidence FROM pick_events ORDER BY time DESC LIMIT 5;"
```

Esperado: `current_qty` caindo de 8 em direção a 1, e um `pick_event` de `quantity = 1` por queda.

- [ ] **Step 6: Commit**

```bash
git add wokwi/sketch.ino firmware/simulator/esp32_sensor_simulator.py
git commit -m "feat(firmware): publish absolute weight and stability instead of pick events"
```

---

## Verificação final contra os critérios de aceite da spec

Rode tudo e confirme cada item antes de declarar o P1 pronto:

```powershell
cd backend
.\gradlew.bat test
cd ../frontend
npm run build
```

| # | Critério | Como verificar |
|---|---|---|
| 1 | Migration aplica em banco limpo e existente | Task 2, Step 4 |
| 2 | Peso absoluto atualiza `current_qty` | Task 8, Step 5 |
| 3 | Queda ≥ 1 unidade gera exatamente um `pick_event` | Task 4 (`weightDropGeneratesPickEventWithTheDifference`) + Task 8, Step 5 |
| 4 | Aumento não gera `pick_event` | Task 4 (`weightRiseIsRestockAndGeneratesNoPickEvent`) |
| 5 | Tela cadastra produto e vincula ao slot | Task 7, Step 7 + uso manual |
| 6 | Botão de tara zera o slot | Task 6 (`tare`) + Task 7 |
| 7 | Isolamento entre lojas | Task 6 (`ProductControllerTest`) |
| 8 | Suíte do backend verde | Comando acima |
