package com.edgeai.industrial.controller;

import com.edgeai.industrial.dto.PickEventDto;
import com.edgeai.industrial.dto.ProductDemandDto;
import com.edgeai.industrial.security.StoreUserDetails;
import com.edgeai.industrial.service.PickService;
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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PickControllerTest {

    @Mock private PickService pickService;
    @InjectMocks private PickController pickController;

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
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")), storeId, UUID.randomUUID());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    @Test
    void recentPicksAreScopedToTheAuthenticatedStore() {
        PickEventDto pick = new PickEventDto(OffsetDateTime.now(), UUID.randomUUID(),
                "esp32-a", "Arroz 1kg", 2, 2.0, 0.98);
        when(pickService.getRecentPicks(storeA, 24)).thenReturn(List.of(pick));

        List<PickEventDto> body = pickController.getRecent(24).getBody();

        assertNotNull(body);
        assertEquals(1, body.size());
        verify(pickService).getRecentPicks(storeA, 24);
        verify(pickService, never()).getRecentPicks(eq(storeB), anyInt());
    }

    @Test
    void demandIsScopedToTheAuthenticatedStore() {
        when(pickService.getProductDemand(storeA, 168)).thenReturn(List.of());

        assertTrue(pickController.getDemand(168).getBody().isEmpty());
        verify(pickService).getProductDemand(storeA, 168);
    }

    @Test
    void anotherStoresUserNeverSeesTheFirstStoresQuery() {
        authenticateAs(storeB);
        ProductDemandDto demand = new ProductDemandDto("Feijao 1kg", 3L, 5L, OffsetDateTime.now());
        when(pickService.getProductDemand(storeB, 168)).thenReturn(List.of(demand));

        List<ProductDemandDto> body = pickController.getDemand(168).getBody();

        assertNotNull(body);
        assertEquals("Feijao 1kg", body.get(0).getProductName());
        verify(pickService, never()).getProductDemand(eq(storeA), anyInt());
    }
}
