package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AlertRepository extends JpaRepository<Alert, UUID> {

    Optional<Alert> findByShelfSlotIdAndAlertTypeAndResolvedAtIsNull(UUID shelfSlotId, String alertType);

    Optional<Alert> findByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNull(
            UUID deviceId, String alertType);

    /**
     * Most recent already-resolved alert of a type for a device. Used to keep the
     * silence rule from flapping; a finder rather than a full scan because the
     * sweep asks this once per silent device, every minute.
     */
    Optional<Alert> findFirstByDeviceIdAndAlertTypeAndShelfSlotIdIsNullAndResolvedAtIsNotNullOrderByResolvedAtDesc(
            UUID deviceId, String alertType);

    Optional<Alert> findByIdAndStoreId(UUID id, UUID storeId);

    List<Alert> findByStoreIdOrderByCreatedAtDesc(UUID storeId);

    List<Alert> findByStoreIdAndResolvedAtIsNullAndAcknowledgedFalseOrderByCreatedAtDesc(UUID storeId);

    long countByStoreIdAndResolvedAtIsNullAndAcknowledgedFalse(UUID storeId);
}
