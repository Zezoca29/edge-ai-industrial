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

    @Test
    void missingSlotIsCreatedUnconfiguredOnFirstStableReading() {
        when(shelfSlotRepository.findByDeviceIdAndSlotIndex(deviceId, (short) 0))
                .thenReturn(Optional.empty());

        shelfService.processWeight(deviceId, now, 5200.0, true);

        ArgumentCaptor<ShelfSlot> captor = ArgumentCaptor.forClass(ShelfSlot.class);
        verify(shelfSlotRepository).save(captor.capture());
        assertEquals(deviceId, captor.getValue().getDeviceId());
        assertNull(captor.getValue().getProductId());
        verifyNoInteractions(pickEventRepository);
    }
}
