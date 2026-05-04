package com.edgeai.industrial.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@Entity
@Table(name = "devices")
public class Device {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(name = "device_type", nullable = false)
    private String deviceType;

    @Column(name = "firmware_version")
    private String firmwareVersion;

    private String location;

    @Column(columnDefinition = "VARCHAR(20) DEFAULT 'inactive'")
    private String status = "inactive";

    @Column(name = "last_seen_at")
    private OffsetDateTime lastSeenAt;

    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }
}
