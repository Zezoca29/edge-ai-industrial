package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.domain.ShelfSlot;
import com.edgeai.industrial.dto.ShelfSlotDto;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.repository.ShelfSlotRepository;
import com.edgeai.industrial.security.CurrentStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/api/shelf-slots")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ShelfSlotController {

    private final ShelfSlotRepository shelfSlotRepository;
    private final ProductRepository productRepository;

    @GetMapping
    public List<ShelfSlotDto> list() {
        UUID storeId = CurrentStore.id();
        return shelfSlotRepository.findByStoreId(storeId).stream()
                .map(slot -> toDto(slot, productName(slot, storeId)))
                .toList();
    }

    @PutMapping("/{id}")
    public ShelfSlotDto update(@PathVariable UUID id, @RequestBody ShelfSlotDto body) {
        UUID storeId = CurrentStore.id();
        ShelfSlot slot = shelfSlotRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Slot nao encontrado"));

        Product bound = null;
        if (body.productId() != null) {
            bound = productRepository.findByIdAndStoreId(body.productId(), storeId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Produto de outra loja"));
        }
        // Trocar de produto invalida a contagem anterior; ajustar so o minimo nao.
        boolean productChanged = !Objects.equals(slot.getProductId(), body.productId());
        slot.setProductId(body.productId());
        if (body.minQty() != null) {
            slot.setMinQty(body.minQty());
        } else if (productChanged && bound != null && bound.getDefaultMinQty() != null) {
            // O minimo combinado na loja e propriedade do produto, e serve de
            // ponto de partida quando ele estreia num slot. So no vinculo: um
            // salvamento posterior sem minQty nao pode desfazer o numero que o
            // lojista ajustou na tela, que e mais recente e mais especifico.
            slot.setMinQty(bound.getDefaultMinQty());
        }
        if (productChanged) {
            slot.setCurrentQty(null);
        }
        shelfSlotRepository.save(slot);
        return toDto(slot, productName(slot, storeId));
    }

    /** Zera o slot com a prateleira vazia: o peso atual vira a tara. */
    @PostMapping("/{id}/tare")
    public ShelfSlotDto tare(@PathVariable UUID id) {
        UUID storeId = CurrentStore.id();
        ShelfSlot slot = shelfSlotRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Slot nao encontrado"));
        if (slot.getCurrentWeightG() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Sem leitura de peso para usar como tara");
        }
        slot.setTareG(slot.getCurrentWeightG());
        slot.setCurrentQty(0);
        slot.setSuspect(false);
        shelfSlotRepository.save(slot);
        return toDto(slot, productName(slot, storeId));
    }

    private String productName(ShelfSlot slot, UUID storeId) {
        if (slot.getProductId() == null) {
            return null;
        }
        return productRepository.findByIdAndStoreId(slot.getProductId(), storeId)
                .map(Product::getName).orElse(null);
    }

    private static ShelfSlotDto toDto(ShelfSlot s, String productName) {
        return new ShelfSlotDto(s.getId(), s.getDeviceId(), s.getSlotIndex(), s.getProductId(),
                productName, s.getTareG(), s.getMinQty(), s.getCurrentQty(),
                s.getCurrentWeightG(), s.getSuspect());
    }
}
