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

        sensorDataRepository.insert(time, device.getId(), device.getName(),
                "temperature", s.getTemperature().getValue(), s.getTemperature().getUnit(),
                classification, anomalyScore);

        sensorDataRepository.insert(time, device.getId(), device.getName(),
                "vibration", s.getVibration().getValue(), s.getVibration().getUnit(),
                classification, anomalyScore);

        sensorDataRepository.insert(time, device.getId(), device.getName(),
                "current", s.getCurrent().getValue(), s.getCurrent().getUnit(),
                classification, anomalyScore);

        if (s.getWeight() != null) {
            sensorDataRepository.insert(time, device.getId(), device.getName(),
                    "weight", s.getWeight().getValue(), s.getWeight().getUnit(),
                    classification, anomalyScore);

            double weightG = ShelfCalculator.toGrams(s.getWeight().getValue(), s.getWeight().getUnit());
            boolean stable = !Boolean.FALSE.equals(s.getWeightStable());
            shelfService.processWeight(device.getId(), time, weightG, stable);
        }
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
