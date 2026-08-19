package com.edgeai.industrial.domain;

import jakarta.persistence.*;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@Entity
@Table(name = "shelf_slots")
public class ShelfSlot {

    @EqualsAndHashCode.Include
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "device_id", nullable = false)
    private UUID deviceId;

    /** P1 only ever uses 0. The column exists so multi-cell devices need no migration. */
    @Column(name = "slot_index", nullable = false)
    private Short slotIndex = 0;

    /** Null means the slot is not configured yet. */
    @Column(name = "product_id")
    private UUID productId;

    @Column(name = "tare_g", nullable = false)
    private Double tareG = 0.0;

    @Column(name = "min_qty", nullable = false)
    private Integer minQty = 3;

    @Column(name = "current_qty")
    private Integer currentQty;

    @Column(name = "current_weight_g")
    private Double currentWeightG;

    @Column(nullable = false)
    private Boolean suspect = false;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    @PreUpdate
    void touch() {
        this.updatedAt = OffsetDateTime.now();
    }
}
