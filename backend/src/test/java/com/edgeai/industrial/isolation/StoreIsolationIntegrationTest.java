package com.edgeai.industrial.isolation;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.domain.ShelfSlot;
import com.edgeai.industrial.dto.PickEventDto;
import com.edgeai.industrial.dto.ProductDemandDto;
import com.edgeai.industrial.dto.SensorReadingDto;
import com.edgeai.industrial.repository.AlertRepository;
import com.edgeai.industrial.repository.DeviceRepository;
import com.edgeai.industrial.repository.PickEventRepository;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.repository.SensorDataRepository;
import com.edgeai.industrial.repository.ShelfSlotRepository;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Proves acceptance criterion 7 against a real Postgres instead of mocks.
 *
 * <p>The mock-based controller tests show that each controller passes the right
 * store id down. They cannot show that the queries honour it — and
 * {@link ShelfSlotRepository#findByStoreId} is a hand-written JPQL cross-join,
 * the only piece of the tenant boundary not derived by Spring Data. So this test
 * seeds two stores into the schema the migrations actually produce and asserts
 * that store A sees none of store B's rows.
 */
@Testcontainers
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({PickEventRepository.class, SensorDataRepository.class})
@EnabledIf("dockerAvailable")
class StoreIsolationIntegrationTest {

    /** Same image as docker-compose: sensor_data and pick_events are hypertables. */
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("timescale/timescaledb:latest-pg16")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("edgeai_test")
            .withUsername("edgeai")
            .withPassword("edgeai");

    static boolean dockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        // The migrations own the schema; Hibernate must not touch it.
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
    }

    /** Runs the project's own migration files, so the test schema is the real one. */
    @BeforeAll
    static void applyMigrations() throws Exception {
        Path migrations = Path.of("..", "database", "migrations");
        try (Connection conn = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement st = conn.createStatement()) {
            // V002, V005 and V007 only seed demo rows; this test seeds its own
            // two stores. V009 is listed because it adds a column: leaving it
            // out gives Product an unmapped field and every products query
            // fails with "column default_min_qty does not exist".
            for (String file : List.of("V001__initial_schema.sql",
                                       "V003__pick_events.sql",
                                       "V004__retail_domain.sql",
                                       "V008__alerts_and_push.sql",
                                       "V009__product_default_min_qty.sql")) {
                st.execute(Files.readString(migrations.resolve(file)));
            }
        }
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private DeviceRepository deviceRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ShelfSlotRepository shelfSlotRepository;
    @Autowired private PickEventRepository pickEventRepository;
    @Autowired private SensorDataRepository sensorDataRepository;
    @Autowired private AlertRepository alertRepository;

    private UUID storeA;
    private UUID storeB;
    private UUID deviceA;
    private UUID deviceB;
    private UUID productA;
    private UUID productB;
    private UUID slotA;
    private UUID slotB;

    @BeforeEach
    void seedTwoStores() {
        storeA = UUID.randomUUID();
        storeB = UUID.randomUUID();
        deviceA = UUID.randomUUID();
        deviceB = UUID.randomUUID();
        productA = UUID.randomUUID();
        productB = UUID.randomUUID();
        slotA = UUID.randomUUID();
        slotB = UUID.randomUUID();

        jdbc.update("INSERT INTO stores (id, name) VALUES (?, ?)", storeA, "Mercadinho A");
        jdbc.update("INSERT INTO stores (id, name) VALUES (?, ?)", storeB, "Mercadinho B");

        insertDevice(deviceA, "esp32-loja-a", storeA);
        insertDevice(deviceB, "esp32-loja-b", storeB);

        insertProduct(productA, storeA, "Arroz da Loja A", "ARZ-A", true);
        insertProduct(productB, storeB, "Arroz da Loja B", "ARZ-B", true);
        // A soft-deleted product of store A: must not come back in the slot dropdown.
        insertProduct(UUID.randomUUID(), storeA, "Produto Desativado", "DEL-A", false);

        insertSlot(slotA, deviceA, productA);
        insertSlot(slotB, deviceB, productB);

        insertPick(deviceA, storeA, productA, "Arroz da Loja A");
        insertPick(deviceB, storeB, productB, "Arroz da Loja B");

        insertReading(deviceA, "weight", 5200.0, "normal");
        insertReading(deviceB, "weight", 4100.0, "normal");
        insertReading(deviceA, "temperature", 80.0, "anomaly");
        insertReading(deviceB, "temperature", 81.0, "anomaly");
    }

    private void insertDevice(UUID id, String name, UUID storeId) {
        jdbc.update("INSERT INTO devices (id, name, device_type, store_id) VALUES (?, ?, 'esp32', ?)",
                id, name, storeId);
    }

    private void insertProduct(UUID id, UUID storeId, String name, String sku, boolean active) {
        jdbc.update("""
                INSERT INTO products (id, store_id, name, sku, unit_weight_g, tolerance_g, active)
                VALUES (?, ?, ?, ?, 1000, 15, ?)
                """, id, storeId, name, sku, active);
    }

    private void insertSlot(UUID id, UUID deviceId, UUID productId) {
        jdbc.update("""
                INSERT INTO shelf_slots (id, device_id, slot_index, product_id, tare_g, min_qty, current_qty)
                VALUES (?, ?, 0, ?, 200, 3, 5)
                """, id, deviceId, productId);
    }

    private void insertPick(UUID deviceId, UUID storeId, UUID productId, String productName) {
        pickEventRepository.saveDerived(deviceId, OffsetDateTime.now(), storeId, productId,
                productName, 2, 2.0, 0.98);
    }

    private void insertReading(UUID deviceId, String sensorType, double value, String classification) {
        sensorDataRepository.insert(OffsetDateTime.now(), deviceId, "ignored",
                sensorType, value, "g", classification, 0.9);
    }

    // ---------------------------------------------------------------- devices

    @Test
    void deviceListOfStoreAContainsNoDeviceOfStoreB() {
        List<Device> devices = deviceRepository.findByStoreIdOrderByNameAsc(storeA);

        assertThat(devices).extracting(Device::getId).containsExactly(deviceA);
        assertThat(devices).extracting(Device::getId).doesNotContain(deviceB);
    }

    @Test
    void aDeviceNameFromStoreBCannotBeResolvedByStoreA() {
        assertThat(deviceRepository.findByNameAndStoreId("esp32-loja-b", storeA)).isEmpty();
        assertThat(deviceRepository.findByNameAndStoreId("esp32-loja-b", storeB)).isPresent();
    }

    // --------------------------------------------------------------- products

    @Test
    void productListOfStoreAContainsNoProductOfStoreBAndNoDeactivatedOne() {
        List<Product> products = productRepository.findByStoreIdAndActiveTrueOrderByNameAsc(storeA);

        assertThat(products).extracting(Product::getId).containsExactly(productA);
        assertThat(products).extracting(Product::getName).doesNotContain("Produto Desativado");
    }

    @Test
    void productOfStoreBIsNotFoundForStoreA() {
        assertThat(productRepository.findByIdAndStoreId(productB, storeA)).isEmpty();
    }

    // ------------------------------------------------------------ shelf slots

    @Test
    void handWrittenShelfSlotCrossJoinReallyFiltersByStore() {
        List<ShelfSlot> slots = shelfSlotRepository.findByStoreId(storeA);

        assertThat(slots).extracting(ShelfSlot::getId).containsExactly(slotA);
        assertThat(slots).extracting(ShelfSlot::getDeviceId).doesNotContain(deviceB);
    }

    @Test
    void shelfSlotOfStoreBIsNotFoundForStoreA() {
        Optional<ShelfSlot> foreign = shelfSlotRepository.findByIdAndStoreId(slotB, storeA);
        Optional<ShelfSlot> own = shelfSlotRepository.findByIdAndStoreId(slotB, storeB);

        assertThat(foreign).isEmpty();
        assertThat(own).isPresent();
    }

    // ----------------------------------------------------------- pick events

    @Test
    void recentPicksOfStoreAContainNoPickOfStoreB() {
        List<PickEventDto> picks = pickEventRepository.findRecent(storeA, 24, 200);

        assertThat(picks).extracting(PickEventDto::getProductName)
                .containsExactly("Arroz da Loja A");
        assertThat(picks).extracting(PickEventDto::getDeviceId).doesNotContain(deviceB);
    }

    @Test
    void demandAggregateOfStoreAContainsNoProductOfStoreB() {
        List<ProductDemandDto> demand = pickEventRepository.findDemandAggregate(storeA, 168);

        assertThat(demand).extracting(ProductDemandDto::getProductName)
                .containsExactly("Arroz da Loja A");
    }

    // -------------------------------------------------------- sensor readings

    @Test
    void latestReadingsOfStoreAContainNoDeviceOfStoreB() {
        List<SensorReadingDto> latest = sensorDataRepository.findLatestPerDevice(storeA);

        assertThat(latest).isNotEmpty();
        assertThat(latest).extracting(SensorReadingDto::getDeviceId).containsOnly(deviceA);
    }

    @Test
    void recentReadingsAndAnomaliesOfStoreAContainNoDeviceOfStoreB() {
        assertThat(sensorDataRepository.findRecent(storeA, 60, 1500))
                .isNotEmpty()
                .extracting(SensorReadingDto::getDeviceId).containsOnly(deviceA);

        assertThat(sensorDataRepository.findAnomalies(storeA, 100))
                .isNotEmpty()
                .extracting(SensorReadingDto::getDeviceId).containsOnly(deviceA);
    }

    @Test
    void readingsForStoreBsDeviceIdReturnNothingToStoreA() {
        OffsetDateTime from = OffsetDateTime.now().minusHours(1);
        OffsetDateTime to = OffsetDateTime.now().plusHours(1);

        assertThat(sensorDataRepository.findByDeviceAndTimeRange(deviceB, storeA, from, to)).isEmpty();
        assertThat(sensorDataRepository.findByDeviceAndTimeRange(deviceB, storeB, from, to)).isNotEmpty();
    }

    // ------------------------------------------------------------- alerts

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
}
