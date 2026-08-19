package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.repository.AlertRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AlertServiceTest {

    @Mock private AlertRepository alertRepository;
    @Mock private ApplicationEventPublisher events;

    @InjectMocks private AlertService alertService;

    private UUID storeId;
    private UUID deviceId;
    private UUID slotId;

    @BeforeEach
    void setUp() {
        storeId = UUID.randomUUID();
        deviceId = UUID.randomUUID();
        slotId = UUID.randomUUID();
    }

    private Alert openAlert() {
        Alert a = new Alert();
        a.setId(UUID.randomUUID());
        a.setStoreId(storeId);
        a.setDeviceId(deviceId);
        a.setShelfSlotId(slotId);
        a.setAlertType(AlertService.TYPE_STOCK_LOW);
        return a;
    }

    @Test
    void openPersistsTheAlertAndPublishesAnEvent() {
        when(alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(slotId, AlertService.TYPE_STOCK_LOW))
                .thenReturn(Optional.empty());
        when(alertRepository.saveAndFlush(any(Alert.class))).thenAnswer(inv -> {
            Alert a = inv.getArgument(0);
            a.setId(UUID.randomUUID());
            return a;
        });

        Optional<Alert> result = alertService.open(storeId, deviceId, slotId,
                AlertService.TYPE_STOCK_LOW, "high", "Arroz 5 kg: restam 4 unidades, minimo 5");

        assertTrue(result.isPresent());
        verify(events).publishEvent(any(AlertOpenedEvent.class));
    }

    @Test
    void openIsANoOpWhenAnAlertOfTheSameTypeIsAlreadyOpenForTheSlot() {
        when(alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(slotId, AlertService.TYPE_STOCK_LOW))
                .thenReturn(Optional.of(openAlert()));

        Optional<Alert> result = alertService.open(storeId, deviceId, slotId,
                AlertService.TYPE_STOCK_LOW, "high", "outra mensagem");

        assertTrue(result.isEmpty(), "o alerta ja aberto nao pode virar um segundo aviso");
        verify(alertRepository, never()).saveAndFlush(any(Alert.class));
        verifyNoInteractions(events);
    }

    @Test
    void openWithoutASlotDeduplicatesByDevice() {
        when(alertRepository.findByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNull(
                deviceId, AlertService.TYPE_DEVICE_SILENT))
                .thenReturn(Optional.empty());
        when(alertRepository.saveAndFlush(any(Alert.class))).thenAnswer(inv -> inv.getArgument(0));

        Optional<Alert> result = alertService.open(storeId, deviceId, null,
                AlertService.TYPE_DEVICE_SILENT, "medium", "Sensor sem sinal ha 10 minutos");

        assertTrue(result.isPresent());
    }

    @Test
    void resolveForSlotStampsResolvedAt() {
        Alert alert = openAlert();
        when(alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(slotId, AlertService.TYPE_STOCK_LOW))
                .thenReturn(Optional.of(alert));

        alertService.resolveForSlot(slotId, AlertService.TYPE_STOCK_LOW);

        ArgumentCaptor<Alert> captor = ArgumentCaptor.forClass(Alert.class);
        verify(alertRepository).save(captor.capture());
        assertNotNull(captor.getValue().getResolvedAt());
    }

    @Test
    void resolveIsSilentWhenNothingIsOpen() {
        when(alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(slotId, AlertService.TYPE_STOCK_LOW))
                .thenReturn(Optional.empty());

        alertService.resolveForSlot(slotId, AlertService.TYPE_STOCK_LOW);

        verify(alertRepository, never()).save(any(Alert.class));
    }

    @Test
    void acknowledgeMarksSeenWithoutResolving() {
        Alert alert = openAlert();
        UUID userId = UUID.randomUUID();
        when(alertRepository.findByIdAndStoreId(alert.getId(), storeId)).thenReturn(Optional.of(alert));

        alertService.acknowledge(alert.getId(), storeId, userId);

        ArgumentCaptor<Alert> captor = ArgumentCaptor.forClass(Alert.class);
        verify(alertRepository).save(captor.capture());
        assertTrue(captor.getValue().getAcknowledged());
        assertEquals(userId, captor.getValue().getAcknowledgedBy());
        assertNotNull(captor.getValue().getAcknowledgedAt());
        assertNull(captor.getValue().getResolvedAt(), "visto nao e o mesmo que resolvido");
    }

    @Test
    void acknowledgeOnAnAlertOfAnotherStoreIsRefused() {
        UUID otherId = UUID.randomUUID();
        when(alertRepository.findByIdAndStoreId(otherId, storeId)).thenReturn(Optional.empty());

        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> alertService.acknowledge(otherId, storeId, UUID.randomUUID()));
    }

    @Test
    void openingAStockLowWithoutASlotThrowsIllegalArgumentException() {
        assertThrows(IllegalArgumentException.class,
                () -> alertService.open(storeId, deviceId, null,
                        AlertService.TYPE_STOCK_LOW, "high", "Estoque baixo"));
    }

    @Test
    void openingADeviceSilentWithASlotThrowsIllegalArgumentException() {
        assertThrows(IllegalArgumentException.class,
                () -> alertService.open(storeId, deviceId, slotId,
                        AlertService.TYPE_DEVICE_SILENT, "medium", "Sensor sem sinal"));
    }

    @Test
    void lastResolvedAtForDeviceReportsTheMostRecentResolution() {
        OffsetDateTime resolvedAt = OffsetDateTime.now().minusMinutes(3);
        Alert resolved = openAlert();
        resolved.setAlertType(AlertService.TYPE_DEVICE_SILENT);
        resolved.setShelfSlotId(null);
        resolved.setResolvedAt(resolvedAt);
        when(alertRepository
                .findFirstByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNotNullOrderByResolvedAtDesc(
                        deviceId, AlertService.TYPE_DEVICE_SILENT))
                .thenReturn(Optional.of(resolved));

        assertEquals(Optional.of(resolvedAt),
                alertService.lastResolvedAtForDevice(deviceId, AlertService.TYPE_DEVICE_SILENT));
    }

    @Test
    void lastResolvedAtForDeviceIsEmptyWhenNothingWasEverResolved() {
        when(alertRepository
                .findFirstByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNotNullOrderByResolvedAtDesc(
                        deviceId, AlertService.TYPE_DEVICE_SILENT))
                .thenReturn(Optional.empty());

        assertTrue(alertService.lastResolvedAtForDevice(deviceId, AlertService.TYPE_DEVICE_SILENT).isEmpty());
    }
}
