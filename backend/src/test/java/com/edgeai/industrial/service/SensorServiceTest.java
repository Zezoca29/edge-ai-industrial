package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.dto.SensorPayloadDto;
import com.edgeai.industrial.repository.SensorDataRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class SensorServiceTest {

    @Mock
    private SensorDataRepository sensorDataRepository;

    @InjectMocks
    private SensorService sensorService;

    @Test
    void saveSensorPayloadInsertsThreeRows() {
        Device device = new Device();
        device.setId(UUID.randomUUID());
        device.setName("esp32-sim-001");

        SensorPayloadDto payload = new SensorPayloadDto();
        payload.setDeviceId("esp32-sim-001");
        payload.setTimestamp(Instant.now());

        SensorPayloadDto.Sensors sensors = new SensorPayloadDto.Sensors();
        SensorPayloadDto.SensorValue temp = new SensorPayloadDto.SensorValue();
        temp.setValue(45.2);
        temp.setUnit("C");
        SensorPayloadDto.SensorValue vib = new SensorPayloadDto.SensorValue();
        vib.setValue(1.8);
        vib.setUnit("mm_s");
        SensorPayloadDto.SensorValue curr = new SensorPayloadDto.SensorValue();
        curr.setValue(3.1);
        curr.setUnit("A");
        sensors.setTemperature(temp);
        sensors.setVibration(vib);
        sensors.setCurrent(curr);
        payload.setSensors(sensors);

        SensorPayloadDto.Inference inference = new SensorPayloadDto.Inference();
        inference.setClassification("normal");
        inference.setAnomalyScore(0.12);
        payload.setInference(inference);

        sensorService.saveSensorPayload(device, payload);

        // 3 sensores = 3 inserções
        verify(sensorDataRepository, times(3)).insert(
                any(), eq(device.getId()), eq(device.getName()),
                any(), anyDouble(), any(), eq("normal"), eq(0.12)
        );
    }
}
