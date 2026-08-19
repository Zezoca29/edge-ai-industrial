package com.edgeai.industrial.repository;

import com.edgeai.industrial.domain.ShelfSlot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ShelfSlotRepository extends JpaRepository<ShelfSlot, UUID> {

    Optional<ShelfSlot> findByDeviceIdAndSlotIndex(UUID deviceId, Short slotIndex);

    @Query("""
            SELECT s FROM ShelfSlot s, Device d
            WHERE s.deviceId = d.id AND d.storeId = :storeId
            ORDER BY s.slotIndex ASC
            """)
    List<ShelfSlot> findByStoreId(UUID storeId);

    @Query("""
            SELECT s FROM ShelfSlot s, Device d
            WHERE s.id = :id AND s.deviceId = d.id AND d.storeId = :storeId
            """)
    Optional<ShelfSlot> findByIdAndStoreId(UUID id, UUID storeId);
}
