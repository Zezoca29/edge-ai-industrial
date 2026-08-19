package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.repository.DeviceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DeviceSilenceMonitorTest {

    @Mock private DeviceRepository deviceRepository;
    @Mock private AlertService alertService;

    private DeviceSilenceMonitor monitor;
    private Clock clock;
    private UUID storeId;

    @BeforeEach
    void setUp() {
        // Relogio fixo: o teste avanca o tempo trocando o Clock, nunca dormindo.
        clock = Clock.fixed(Instant.parse("2026-08-18T12:00:00Z"), ZoneOffset.UTC);
        storeId = UUID.randomUUID();
        monitor = new DeviceSilenceMonitor(deviceRepository, alertService, clock, 10);
    }

    private Device device(OffsetDateTime lastSeen) {
        Device d = new Device();
        d.setId(UUID.randomUUID());
        d.setName("wokwi-shelf-001");
        d.setStoreId(storeId);
        d.setLastSeenAt(lastSeen);
        return d;
    }

    @Test
    void aDeviceSilentBeyondTheThresholdRaisesAnAlert() {
        Device d = device(OffsetDateTime.parse("2026-08-18T11:45:00Z"));  // 15 min atras
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));

        monitor.sweep();

        verify(alertService).open(eq(storeId), eq(d.getId()), isNull(),
                eq(AlertService.TYPE_DEVICE_SILENT), eq("medium"), contains("wokwi-shelf-001"));
    }

    @Test
    void aDeviceReportingWithinTheThresholdRaisesNothingAndResolves() {
        Device d = device(OffsetDateTime.parse("2026-08-18T11:58:00Z"));  // 2 min atras
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));

        monitor.sweep();

        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
        verify(alertService).resolveForDevice(d.getId(), AlertService.TYPE_DEVICE_SILENT);
    }

    @Test
    void aDeviceThatNeverReportedIsNotDeclaredSilent() {
        Device d = device(null);
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));

        monitor.sweep();

        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
    }

    @Test
    void aDeviceExactlyAtTheThresholdIsStillConsideredAlive() {
        Device d = device(OffsetDateTime.parse("2026-08-18T11:50:00Z"));  // exatamente 10 min
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));

        monitor.sweep();

        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
    }

    @Test
    void aDeviceResolvedInsideTheLastThresholdPeriodIsNotDeclaredSilentAgain() {
        // Deep sleep com intervalo perto do limite: sem protecao, cada despertar
        // produziria abre -> notifica -> resolve -> abre.
        Device d = device(OffsetDateTime.parse("2026-08-18T11:45:00Z"));  // 15 min atras
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));
        when(alertService.lastResolvedAtForDevice(d.getId(), AlertService.TYPE_DEVICE_SILENT))
                .thenReturn(Optional.of(OffsetDateTime.parse("2026-08-18T11:56:00Z")));  // 4 min atras

        monitor.sweep();

        verify(alertService, never()).open(any(), any(), any(), any(), any(), any());
    }

    @Test
    void aDeviceResolvedLongerAgoThanTheThresholdMayBeDeclaredSilentAgain() {
        Device d = device(OffsetDateTime.parse("2026-08-18T11:45:00Z"));  // 15 min atras
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(d));
        when(alertService.lastResolvedAtForDevice(d.getId(), AlertService.TYPE_DEVICE_SILENT))
                .thenReturn(Optional.of(OffsetDateTime.parse("2026-08-18T11:30:00Z")));  // 30 min atras

        monitor.sweep();

        verify(alertService).open(eq(storeId), eq(d.getId()), isNull(),
                eq(AlertService.TYPE_DEVICE_SILENT), eq("medium"), contains("wokwi-shelf-001"));
    }

    @Test
    void oneFailingDeviceDoesNotAbortTheSweepForTheRest() {
        Device broken = device(OffsetDateTime.parse("2026-08-18T11:45:00Z"));
        Device healthySilent = device(OffsetDateTime.parse("2026-08-18T11:40:00Z"));
        when(deviceRepository.findByStoreIdIsNotNull()).thenReturn(List.of(broken, healthySilent));
        when(alertService.lastResolvedAtForDevice(broken.getId(), AlertService.TYPE_DEVICE_SILENT))
                .thenThrow(new IllegalStateException("conexao caiu"));

        monitor.sweep();

        verify(alertService).open(eq(storeId), eq(healthySilent.getId()), isNull(),
                eq(AlertService.TYPE_DEVICE_SILENT), eq("medium"), contains("wokwi-shelf-001"));
    }
}
