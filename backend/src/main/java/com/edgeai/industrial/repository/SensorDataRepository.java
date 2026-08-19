package com.edgeai.industrial.repository;

import com.edgeai.industrial.dto.SensorReadingDto;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class SensorDataRepository {

    private final JdbcTemplate jdbc;

    public void insert(OffsetDateTime time, UUID deviceId, String deviceName,
                       String sensorType, double value, String unit,
                       String classification, double anomalyScore) {
        jdbc.update("""
                INSERT INTO sensor_data
                    (time, device_id, sensor_type, value, unit, classification, anomaly_score)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                Timestamp.from(time.toInstant()), deviceId, sensorType,
                value, unit, classification, anomalyScore);
    }

    /**
     * The device id comes straight from the query string, so ownership is enforced
     * by the join: a device of another store simply matches no rows.
     */
    public List<SensorReadingDto> findByDeviceAndTimeRange(UUID deviceId,
                                                           UUID storeId,
                                                           OffsetDateTime from,
                                                           OffsetDateTime to) {
        return jdbc.query("""
                SELECT sd.time, sd.device_id, d.name AS device_name,
                       sd.sensor_type, sd.value, sd.unit,
                       sd.classification, sd.anomaly_score
                FROM sensor_data sd
                JOIN devices d ON d.id = sd.device_id
                WHERE sd.device_id = ?
                  AND d.store_id = ?
                  AND sd.time BETWEEN ? AND ?
                ORDER BY sd.time DESC
                LIMIT 500
                """,
                rowMapper(),
                deviceId,
                storeId,
                Timestamp.from(from.toInstant()),
                Timestamp.from(to.toInstant()));
    }

    public List<SensorReadingDto> findLatestPerDevice(UUID storeId) {
        return jdbc.query("""
                SELECT DISTINCT ON (sd.device_id)
                    sd.time, sd.device_id, d.name AS device_name,
                    sd.sensor_type, sd.value, sd.unit,
                    sd.classification, sd.anomaly_score
                FROM sensor_data sd
                JOIN devices d ON d.id = sd.device_id
                WHERE d.store_id = ?
                ORDER BY sd.device_id, sd.time DESC
                """,
                rowMapper(), storeId);
    }

    public List<SensorReadingDto> findRecent(UUID storeId, int minutes, int limit) {
        return jdbc.query("""
                SELECT sd.time, sd.device_id, d.name AS device_name,
                       sd.sensor_type, sd.value, sd.unit,
                       sd.classification, sd.anomaly_score
                FROM sensor_data sd
                JOIN devices d ON d.id = sd.device_id
                WHERE d.store_id = ?
                  AND sd.time >= NOW() - (? * INTERVAL '1 minute')
                ORDER BY sd.time ASC
                LIMIT ?
                """,
                rowMapper(), storeId, minutes, limit);
    }

    public List<SensorReadingDto> findAnomalies(UUID storeId, int limit) {
        return jdbc.query("""
                SELECT sd.time, sd.device_id, d.name AS device_name,
                       sd.sensor_type, sd.value, sd.unit,
                       sd.classification, sd.anomaly_score
                FROM sensor_data sd
                JOIN devices d ON d.id = sd.device_id
                WHERE d.store_id = ?
                  AND sd.classification = 'anomaly'
                ORDER BY sd.time DESC
                LIMIT ?
                """,
                rowMapper(), storeId, limit);
    }

    private RowMapper<SensorReadingDto> rowMapper() {
        return (rs, rowNum) -> new SensorReadingDto(
                rs.getTimestamp("time").toInstant().atOffset(ZoneOffset.UTC),
                UUID.fromString(rs.getString("device_id")),
                rs.getString("device_name"),
                rs.getString("sensor_type"),
                rs.getDouble("value"),
                rs.getString("unit"),
                rs.getString("classification"),
                rs.getDouble("anomaly_score")
        );
    }
}
