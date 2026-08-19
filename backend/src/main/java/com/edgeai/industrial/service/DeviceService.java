package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.repository.DeviceRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DeviceService {

    private final DeviceRepository deviceRepository;

    @Transactional
    public Device findOrCreate(String deviceId, String firmwareVersion) {
        return deviceRepository.findByName(deviceId).orElseGet(() -> {
            Device device = new Device();
            device.setName(deviceId);
            device.setDeviceType("esp32");
            device.setFirmwareVersion(firmwareVersion);
            device.setStatus("online");
            device.setLastSeenAt(OffsetDateTime.now());
            return deviceRepository.save(device);
        });
    }

    @Transactional
    public void markOnline(Device device) {
        deviceRepository.updateStatusAndLastSeen(
                device.getId(), "online",
                OffsetDateTime.now(), OffsetDateTime.now()
        );
    }

    @Transactional
    public void markOffline(String deviceName) {
        deviceRepository.findByName(deviceName).ifPresent(device ->
                deviceRepository.updateStatusAndLastSeen(
                        device.getId(), "offline",
                        OffsetDateTime.now(), OffsetDateTime.now()
                )
        );
    }

    /** Devices of one store only. There is no global device list by design. */
    public List<Device> listByStore(UUID storeId) {
        return deviceRepository.findByStoreIdOrderByNameAsc(storeId);
    }

    public Optional<Device> findInStore(String name, UUID storeId) {
        return deviceRepository.findByNameAndStoreId(name, storeId);
    }
}
