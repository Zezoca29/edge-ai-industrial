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
@Table(name = "products")
public class Product {

    @EqualsAndHashCode.Include
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "store_id", nullable = false)
    private UUID storeId;

    @Column(nullable = false)
    private String name;

    private String sku;

    /** Weight of a single unit, in grams. Drives the whole stock count. */
    @Column(name = "unit_weight_g", nullable = false)
    private Double unitWeightG;

    /** Accepted gap between the reading and the expected integer multiple. */
    @Column(name = "tolerance_g", nullable = false)
    private Double toleranceG = 5.0;

    @Column(name = "unit_price_cents")
    private Integer unitPriceCents;

    /**
     * Minimo de reposicao combinado na loja, por produto. Um slot adota este
     * numero quando o produto lhe e vinculado e nenhum minimo e enviado junto.
     * Nulo significa "sem numero combinado": o slot fica com o proprio default.
     */
    @Column(name = "default_min_qty")
    private Integer defaultMinQty;

    @Column(nullable = false)
    private Boolean active = true;

    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }
}
