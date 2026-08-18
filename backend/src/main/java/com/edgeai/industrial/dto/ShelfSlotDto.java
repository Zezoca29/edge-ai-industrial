package com.edgeai.industrial.dto;

import java.util.UUID;

public record ShelfSlotDto(
        UUID id,
        UUID deviceId,
        Short slotIndex,
        UUID productId,
        String productName,
        Double tareG,
        Integer minQty,
        Integer currentQty,
        Double currentWeightG,
        Boolean suspect
) {
}
