package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.domain.Store;
import com.edgeai.industrial.repository.DeviceRepository;
import com.edgeai.industrial.repository.StoreRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceService {

    private final DeviceRepository deviceRepository;
    private final StoreRepository storeRepository;

    @Transactional
    public Device findOrCreate(String deviceId, String firmwareVersion) {
        return deviceRepository.findByName(deviceId).orElseGet(() -> {
            Device device = new Device();
            device.setName(deviceId);
            device.setDeviceType("esp32");
            device.setFirmwareVersion(firmwareVersion);
            device.setStatus("online");
            device.setLastSeenAt(OffsetDateTime.now());
            device.setStoreId(adoptingStoreId(deviceId));
            return deviceRepository.save(device);
        });
    }

    /**
     * Every read path is scoped by store, so a device created without one is
     * invisible everywhere. While a single store exists there is no ambiguity
     * about where a self-registering device belongs, so it is adopted. With
     * none or several, guessing would leak the device into the wrong store, so
     * it stays unassigned and says so.
     */
    private UUID adoptingStoreId(String deviceName) {
        List<Store> stores = storeRepository.findAll();
        if (stores.size() == 1) {
            return stores.get(0).getId();
        }
        log.warn("Device {} registered without a store ({} stores exist); "
                + "it will not appear on any store's dashboard until one is assigned",
                deviceName, stores.size());
        return null;
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
