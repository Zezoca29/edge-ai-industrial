package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.Device;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface DeviceRepository extends JpaRepository<Device, UUID> {

    Optional<Device> findByName(String name);

    List<Device> findByStoreIdOrderByNameAsc(UUID storeId);

    Optional<Device> findByNameAndStoreId(String name, UUID storeId);

    @Modifying
    @Query("UPDATE Device d SET d.status = :status, d.lastSeenAt = :lastSeenAt, d.updatedAt = :updatedAt WHERE d.id = :id")
    void updateStatusAndLastSeen(UUID id, String status, OffsetDateTime lastSeenAt, OffsetDateTime updatedAt);

    List<Device> findByStoreIdIsNotNull();
}
