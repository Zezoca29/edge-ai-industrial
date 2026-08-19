package com.edgeai.industrial.dto;

import java.util.UUID;

public record ProductDto(
        UUID id,
        String name,
        String sku,
        Double unitWeightG,
        Double toleranceG,
        Integer unitPriceCents,
        Boolean active
) {
}
