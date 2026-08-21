package com.edgeai.industrial.dto;

import java.util.UUID;

public record ProductDto(
        UUID id,
        String name,
        String sku,
        Double unitWeightG,
        Double toleranceG,

        /**
         * Minimo de reposicao combinado na loja. Um slot adota este numero
         * quando o produto lhe e vinculado. Nulo = sem numero combinado.
         */
        Integer defaultMinQty,

        Integer unitPriceCents,
        Boolean active
) {
}
