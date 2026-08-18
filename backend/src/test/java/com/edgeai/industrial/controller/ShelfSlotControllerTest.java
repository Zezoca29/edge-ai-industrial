package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.domain.ShelfSlot;
import com.edgeai.industrial.dto.ShelfSlotDto;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.repository.ShelfSlotRepository;
import com.edgeai.industrial.security.StoreUserDetails;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ShelfSlotControllerTest {

    @Mock private ShelfSlotRepository shelfSlotRepository;
    @Mock private ProductRepository productRepository;
    @InjectMocks private ShelfSlotController shelfSlotController;

    private UUID storeA;
    private UUID storeB;

    @BeforeEach
    void setUp() {
        storeA = UUID.randomUUID();
        storeB = UUID.randomUUID();
        authenticateAs(storeA);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(UUID storeId) {
        StoreUserDetails principal = new StoreUserDetails(
                "user@loja.local", "hash",
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")), storeId);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    private ShelfSlot existingSlot(UUID id, UUID productId, Integer currentQty) {
        ShelfSlot slot = new ShelfSlot();
        slot.setId(id);
        slot.setDeviceId(UUID.randomUUID());
        slot.setSlotIndex((short) 0);
        slot.setProductId(productId);
        slot.setTareG(100.0);
        slot.setMinQty(3);
        slot.setCurrentQty(currentQty);
        slot.setCurrentWeightG(500.0);
        slot.setSuspect(false);
        return slot;
    }

    private Product product(UUID id, UUID storeId, String name) {
        Product p = new Product();
        p.setId(id);
        p.setStoreId(storeId);
        p.setName(name);
        p.setUnitWeightG(100.0);
        p.setToleranceG(5.0);
        return p;
    }

    @Test
    void bindingADifferentProductToASlotClearsCurrentQty() {
        UUID slotId = UUID.randomUUID();
        UUID oldProductId = UUID.randomUUID();
        UUID newProductId = UUID.randomUUID();
        ShelfSlot slot = existingSlot(slotId, oldProductId, 5);

        when(shelfSlotRepository.findByIdAndStoreId(slotId, storeA)).thenReturn(Optional.of(slot));
        when(productRepository.findByIdAndStoreId(newProductId, storeA))
                .thenReturn(Optional.of(product(newProductId, storeA, "Novo Produto")));
        when(shelfSlotRepository.save(any(ShelfSlot.class))).thenAnswer(inv -> inv.getArgument(0));

        ShelfSlotDto body = new ShelfSlotDto(null, null, null, newProductId, null, null, 3, null, null, null);
        ShelfSlotDto result = shelfSlotController.update(slotId, body);

        assertNull(result.currentQty());
        assertEquals(newProductId, result.productId());
    }

    @Test
    void updatingOnlyMinQtyWithSameProductIdLeavesCurrentQtyUntouched() {
        UUID slotId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        ShelfSlot slot = existingSlot(slotId, productId, 5);

        when(shelfSlotRepository.findByIdAndStoreId(slotId, storeA)).thenReturn(Optional.of(slot));
        when(productRepository.findByIdAndStoreId(productId, storeA))
                .thenReturn(Optional.of(product(productId, storeA, "Mesmo Produto")));
        when(shelfSlotRepository.save(any(ShelfSlot.class))).thenAnswer(inv -> inv.getArgument(0));

        ShelfSlotDto body = new ShelfSlotDto(null, null, null, productId, null, null, 7, null, null, null);
        ShelfSlotDto result = shelfSlotController.update(slotId, body);

        assertEquals(5, result.currentQty());
        assertEquals(7, result.minQty());
    }

    @Test
    void slotBelongingToAnotherStoreIsNotFound() {
        UUID slotId = UUID.randomUUID();
        when(shelfSlotRepository.findByIdAndStoreId(slotId, storeA)).thenReturn(Optional.empty());

        ShelfSlotDto body = new ShelfSlotDto(null, null, null, null, null, null, 3, null, null, null);
        assertThrows(ResponseStatusException.class, () -> shelfSlotController.update(slotId, body));
    }

    @Test
    void bindingAProductFromAnotherStoreIsRejected() {
        UUID slotId = UUID.randomUUID();
        UUID otherStoreProductId = UUID.randomUUID();
        ShelfSlot slot = existingSlot(slotId, null, null);

        when(shelfSlotRepository.findByIdAndStoreId(slotId, storeA)).thenReturn(Optional.of(slot));
        when(productRepository.findByIdAndStoreId(otherStoreProductId, storeA)).thenReturn(Optional.empty());

        ShelfSlotDto body = new ShelfSlotDto(null, null, null, otherStoreProductId, null, null, 3, null, null, null);
        assertThrows(ResponseStatusException.class, () -> shelfSlotController.update(slotId, body));
    }
}
