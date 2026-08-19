package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.domain.Store;
import com.edgeai.industrial.repository.DeviceRepository;
import com.edgeai.industrial.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DeviceServiceTest {

    @Mock
    private DeviceRepository deviceRepository;

    @Mock
    private StoreRepository storeRepository;

    @InjectMocks
    private DeviceService deviceService;

    private Store store(UUID id) {
        Store store = new Store();
        store.setId(id);
        store.setName("Mercadinho Demo");
        return store;
    }

    private Device captureSavedDevice() {
        ArgumentCaptor<Device> captor = ArgumentCaptor.forClass(Device.class);
        verify(deviceRepository).save(captor.capture());
        return captor.getValue();
    }

    @Test
    void newDeviceAdoptsTheStoreWhenExactlyOneExists() {
        UUID storeId = UUID.randomUUID();
        when(deviceRepository.findByName("wokwi-shelf-002")).thenReturn(Optional.empty());
        when(storeRepository.findAll()).thenReturn(List.of(store(storeId)));
        when(deviceRepository.save(any(Device.class))).thenAnswer(inv -> inv.getArgument(0));

        deviceService.findOrCreate("wokwi-shelf-002", "wokwi-1.0");

        assertEquals(storeId, captureSavedDevice().getStoreId(),
                "a device registering itself must become visible somewhere");
    }

    @Test
    void newDeviceStaysUnassignedWhenNoStoreExists() {
        when(deviceRepository.findByName("wokwi-shelf-002")).thenReturn(Optional.empty());
        when(storeRepository.findAll()).thenReturn(List.of());
        when(deviceRepository.save(any(Device.class))).thenAnswer(inv -> inv.getArgument(0));

        deviceService.findOrCreate("wokwi-shelf-002", "wokwi-1.0");

        assertNull(captureSavedDevice().getStoreId());
    }

    @Test
    void newDeviceStaysUnassignedWhenTheStoreIsAmbiguous() {
        when(deviceRepository.findByName("wokwi-shelf-002")).thenReturn(Optional.empty());
        when(storeRepository.findAll())
                .thenReturn(List.of(store(UUID.randomUUID()), store(UUID.randomUUID())));
        when(deviceRepository.save(any(Device.class))).thenAnswer(inv -> inv.getArgument(0));

        deviceService.findOrCreate("wokwi-shelf-002", "wokwi-1.0");

        assertNull(captureSavedDevice().getStoreId(),
                "guessing between stores would leak a device into the wrong one");
    }

    @Test
    void existingDeviceKeepsItsStoreAndIsNotResaved() {
        UUID ownerStoreId = UUID.randomUUID();
        Device existing = new Device();
        existing.setId(UUID.randomUUID());
        existing.setName("wokwi-shelf-001");
        existing.setStoreId(ownerStoreId);
        when(deviceRepository.findByName("wokwi-shelf-001")).thenReturn(Optional.of(existing));

        Device result = deviceService.findOrCreate("wokwi-shelf-001", "wokwi-1.0");

        assertEquals(ownerStoreId, result.getStoreId());
        verify(deviceRepository, never()).save(any(Device.class));
        verifyNoInteractions(storeRepository);
    }
}
