package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.repository.AlertRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {

    public static final String TYPE_STOCK_LOW = "stock_low";
    public static final String TYPE_DEVICE_SILENT = "device_silent";

    private final AlertRepository alertRepository;
    private final ApplicationEventPublisher events;

    /**
     * Opens an alert unless one of the same type is already open for the same
     * target. Stock alerts must have a shelf slot; device alerts must not.
     *
     * <p>Runs in its own transaction on purpose. The partial unique index is the
     * last-resort guarantee against a duplicate, and a violation of it poisons
     * whatever transaction it happens in — a lesson from the shelf slot race in
     * P1. Keeping the insert isolated means a caller mid-ingestion loses at most
     * the alert, never the reading it was processing.
     *
     * <p>{@code saveAndFlush} is used to force the INSERT to execute before the
     * event is published, so a concurrent duplicate cannot result in a phantom
     * event. A duplicate violation throws {@link org.springframework.dao.DataIntegrityViolationException},
     * which the caller must catch; the {@code REQUIRES_NEW} isolation means the
     * caller's own transaction is not marked rollback-only and can recover.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<Alert> open(UUID storeId, UUID deviceId, UUID shelfSlotId,
                                String type, String severity, String message) {
        validateTypeAndSlotPairing(type, shelfSlotId);

        Optional<Alert> existing = shelfSlotId != null
                ? alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(shelfSlotId, type)
                : alertRepository.findByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNull(deviceId, type);

        if (existing.isPresent()) {
            return Optional.empty();
        }

        Alert alert = new Alert();
        alert.setStoreId(storeId);
        alert.setDeviceId(deviceId);
        alert.setShelfSlotId(shelfSlotId);
        alert.setAlertType(type);
        alert.setSeverity(severity);
        alert.setMessage(message);

        Alert saved = alertRepository.saveAndFlush(alert);
        events.publishEvent(new AlertOpenedEvent(saved.getId(), storeId, titleFor(type), message));
        return Optional.of(saved);
    }

    private void validateTypeAndSlotPairing(String type, UUID shelfSlotId) {
        if (TYPE_STOCK_LOW.equals(type) && shelfSlotId == null) {
            throw new IllegalArgumentException("stock_low alert must have a shelfSlotId");
        }
        if (TYPE_DEVICE_SILENT.equals(type) && shelfSlotId != null) {
            throw new IllegalArgumentException("device_silent alert must have a null shelfSlotId");
        }
    }

    @Transactional
    public void resolveForSlot(UUID shelfSlotId, String type) {
        alertRepository.findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(shelfSlotId, type)
                .ifPresent(this::stampResolved);
    }

    @Transactional
    public void resolveForDevice(UUID deviceId, String type) {
        alertRepository.findByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNull(deviceId, type)
                .ifPresent(this::stampResolved);
    }

    @Transactional
    public void acknowledge(UUID alertId, UUID storeId, UUID userId) {
        Alert alert = alertRepository.findByIdAndStoreId(alertId, storeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Alerta nao encontrado"));
        alert.setAcknowledged(true);
        alert.setAcknowledgedBy(userId);
        alert.setAcknowledgedAt(OffsetDateTime.now());
        alertRepository.save(alert);
    }

    public List<Alert> list(UUID storeId, boolean onlyOpen) {
        return onlyOpen
                ? alertRepository.findByStoreIdAndResolvedAtIsNullAndAcknowledgedFalseOrderByCreatedAtDesc(storeId)
                : alertRepository.findByStoreIdOrderByCreatedAtDesc(storeId);
    }

    public long countOpen(UUID storeId) {
        return alertRepository.countByStoreIdAndResolvedAtIsNullAndAcknowledgedFalse(storeId);
    }

    private void stampResolved(Alert alert) {
        alert.setResolvedAt(OffsetDateTime.now());
        alertRepository.save(alert);
    }

    private static String titleFor(String type) {
        return TYPE_DEVICE_SILENT.equals(type) ? "Sensor sem sinal" : "Estoque baixo";
    }
}
