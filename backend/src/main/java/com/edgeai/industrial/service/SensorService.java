package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.dto.SensorPayloadDto;
import com.edgeai.industrial.dto.SensorReadingDto;
import com.edgeai.industrial.repository.SensorDataRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SensorService {

    private final SensorDataRepository sensorDataRepository;
    private final ShelfService shelfService;

    public void saveSensorPayload(Device device, SensorPayloadDto payload) {
        OffsetDateTime time = payload.getTimestamp().atOffset(ZoneOffset.UTC);
        String classification = payload.getInference().getClassification();
        double anomalyScore = payload.getInference().getAnomalyScore();

        SensorPayloadDto.Sensors s = payload.getSensors();

        // Cada grandeza e opcional. Um no de prateleira carrega celula de carga
        // e mais nada; desreferenciar temperature nele estourava NPE e levava
        // junto a leitura de peso, que era a unica coisa que ele tinha a dizer.
        insertIfPresent(time, device, "temperature", s.getTemperature(), classification, anomalyScore);
        insertIfPresent(time, device, "vibration", s.getVibration(), classification, anomalyScore);
        insertIfPresent(time, device, "current", s.getCurrent(), classification, anomalyScore);
        insertIfPresent(time, device, "weight", s.getWeight(), classification, anomalyScore);

        if (s.getWeight() != null) {
            double weightG = ShelfCalculator.toGrams(s.getWeight().getValue(), s.getWeight().getUnit());
            boolean stable = !Boolean.FALSE.equals(s.getWeightStable());
            shelfService.processWeight(device.getId(), time, weightG, stable);
        }
    }

    private void insertIfPresent(OffsetDateTime time, Device device, String sensorType,
                                 SensorPayloadDto.SensorValue value,
                                 String classification, double anomalyScore) {
        if (value == null) {
            return;
        }
        sensorDataRepository.insert(time, device.getId(), device.getName(),
                sensorType, value.getValue(), value.getUnit(), classification, anomalyScore);
    }

    public List<SensorReadingDto> getReadings(UUID deviceId, UUID storeId,
                                              OffsetDateTime from, OffsetDateTime to) {
        return sensorDataRepository.findByDeviceAndTimeRange(deviceId, storeId, from, to);
    }

    public List<SensorReadingDto> getLatestPerDevice(UUID storeId) {
        return sensorDataRepository.findLatestPerDevice(storeId);
    }

    public List<SensorReadingDto> getRecentReadings(UUID storeId, int minutes) {
        return sensorDataRepository.findRecent(storeId, minutes, 1500);
    }

    public List<SensorReadingDto> getAnomalies(UUID storeId) {
        return sensorDataRepository.findAnomalies(storeId, 100);
    }
}
