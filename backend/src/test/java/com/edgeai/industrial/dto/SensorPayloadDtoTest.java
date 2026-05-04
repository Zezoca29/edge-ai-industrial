package com.edgeai.industrial.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class SensorPayloadDtoTest {

    private final ObjectMapper mapper = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    @Test
    void deserializesMqttSensorPayload() throws Exception {
        String json = """
                {
                  "device_id": "esp32-sim-001",
                  "timestamp": "2026-05-03T12:00:00Z",
                  "sensors": {
                    "temperature": {"value": 45.2, "unit": "C"},
                    "vibration": {"value": 1.8, "unit": "mm_s"},
                    "current": {"value": 3.1, "unit": "A"}
                  },
                  "inference": {
                    "classification": "normal",
                    "anomaly_score": 0.12,
                    "model_version": "sim-v1"
                  }
                }
                """;

        SensorPayloadDto dto = mapper.readValue(json, SensorPayloadDto.class);

        assertThat(dto.getDeviceId()).isEqualTo("esp32-sim-001");
        assertThat(dto.getSensors().getTemperature().getValue()).isEqualTo(45.2);
        assertThat(dto.getInference().getClassification()).isEqualTo("normal");
        assertThat(dto.getInference().getAnomalyScore()).isEqualTo(0.12);
    }
}
