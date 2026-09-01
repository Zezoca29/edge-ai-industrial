package com.edgeai.industrial.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * `deviceId` is what lets the dashboard file an alert under the bancada that
 * raised it. `deviceName` is a convenience for the same lookup and is null when
 * the device no longer exists.
 */
public record AlertDto(
        UUID id,
        UUID deviceId,
        String deviceName,
        String alertType,
        String severity,
        String message,
        boolean acknowledged,
        OffsetDateTime createdAt,
        OffsetDateTime resolvedAt
) {
}
