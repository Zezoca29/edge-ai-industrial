package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.dto.ProductDto;
import com.edgeai.industrial.repository.ProductRepository;
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
class ProductControllerTest {

    @Mock private ProductRepository productRepository;
    @InjectMocks private ProductController productController;

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

    @Test
    void listReturnsOnlyProductsOfTheAuthenticatedStore() {
        Product p = new Product();
        p.setId(UUID.randomUUID());
        p.setStoreId(storeA);
        p.setName("Arroz 1kg");
        p.setUnitWeightG(1000.0);
        p.setToleranceG(15.0);
        when(productRepository.findByStoreIdAndActiveTrueOrderByNameAsc(storeA)).thenReturn(List.of(p));

        List<ProductDto> result = productController.list();

        assertEquals(1, result.size());
        assertEquals("Arroz 1kg", result.get(0).name());
        verify(productRepository).findByStoreIdAndActiveTrueOrderByNameAsc(storeA);
    }

    @Test
    void createStampsTheAuthenticatedStoreOnTheProduct() {
        when(productRepository.save(any(Product.class))).thenAnswer(inv -> {
            Product saved = inv.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });

        ProductDto body = new ProductDto(null, "Feijao 1kg", "FJO-1KG", 1000.0, 15.0, 890, true);
        ProductDto created = productController.create(body);

        assertNotNull(created.id());
        assertEquals("Feijao 1kg", created.name());
    }

    @Test
    void productFromAnotherStoreIsNotFound() {
        UUID otherId = UUID.randomUUID();
        when(productRepository.findByIdAndStoreId(otherId, storeA)).thenReturn(Optional.empty());

        assertThrows(ResponseStatusException.class, () -> productController.update(otherId,
                new ProductDto(null, "X", null, 100.0, 5.0, null, true)));
    }

    @Test
    void listOnlyAsksForActiveProductsSoASoftDeletedOneCannotBeBoundToASlot() {
        when(productRepository.findByStoreIdAndActiveTrueOrderByNameAsc(storeA)).thenReturn(List.of());

        assertTrue(productController.list().isEmpty());

        verify(productRepository).findByStoreIdAndActiveTrueOrderByNameAsc(storeA);
    }

    @Test
    void deactivateSoftDeletesTheProduct() {
        UUID id = UUID.randomUUID();
        Product p = new Product();
        p.setId(id);
        p.setStoreId(storeA);
        p.setActive(true);
        when(productRepository.findByIdAndStoreId(id, storeA)).thenReturn(Optional.of(p));

        productController.deactivate(id);

        assertFalse(p.getActive());
        verify(productRepository).save(p);
    }

    @Test
    void listUsesTheStoreOfWhoeverIsAuthenticated() {
        authenticateAs(storeB);
        when(productRepository.findByStoreIdAndActiveTrueOrderByNameAsc(storeB)).thenReturn(List.of());

        assertTrue(productController.list().isEmpty());
        verify(productRepository, never()).findByStoreIdAndActiveTrueOrderByNameAsc(storeA);
    }
}
