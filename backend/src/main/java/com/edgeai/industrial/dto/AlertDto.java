package com.edgeai.industrial.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record AlertDto(
        UUID id,
        String alertType,
        String severity,
        String message,
        boolean acknowledged,
        OffsetDateTime createdAt,
        OffsetDateTime resolvedAt
) {
}
