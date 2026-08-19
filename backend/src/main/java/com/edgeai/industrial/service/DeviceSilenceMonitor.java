package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.repository.DeviceRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;

/**
 * Raises an alert for a device that stopped reporting.
 *
 * <p>Silence is the one failure the ingestion path cannot notice: when nothing
 * arrives, nothing runs. Without this sweep the system would go quiet after a
 * sensor died, and quiet reads as "everything is fine".
 */
@Slf4j
@Component
public class DeviceSilenceMonitor {

    private final DeviceRepository deviceRepository;
    private final AlertService alertService;
    private final Clock clock;
    private final long silenceMinutes;

    public DeviceSilenceMonitor(DeviceRepository deviceRepository,
                                AlertService alertService,
                                Clock clock,
                                @Value("${alerts.device-silence-minutes:10}") long silenceMinutes) {
        this.deviceRepository = deviceRepository;
        this.alertService = alertService;
        this.clock = clock;
        this.silenceMinutes = silenceMinutes;
    }

    /** fixedDelay, not fixedRate: a slow sweep must not stack on the next one. */
    @Scheduled(fixedDelay = 60_000L, initialDelay = 60_000L)
    public void sweep() {
        OffsetDateTime deadline = OffsetDateTime.now(clock).minus(Duration.ofMinutes(silenceMinutes));

        for (Device device : deviceRepository.findByStoreIdIsNotNull()) {
            OffsetDateTime lastSeen = device.getLastSeenAt();
            if (lastSeen == null) {
                // Never reported at all: registered but never installed. Alerting on
                // it would fire for every device someone created and left in a box.
                continue;
            }

            if (lastSeen.isBefore(deadline)) {
                String message = String.format("%s: sem sinal ha mais de %d minutos",
                        device.getName(), silenceMinutes);
                try {
                    alertService.open(device.getStoreId(), device.getId(), null,
                            AlertService.TYPE_DEVICE_SILENT, "medium", message);
                } catch (DataIntegrityViolationException e) {
                    log.debug("Silence alert for device {} already open", device.getId());
                }
            } else {
                alertService.resolveForDevice(device.getId(), AlertService.TYPE_DEVICE_SILENT);
            }
        }
    }
}
