package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.PushSubscription;
import com.edgeai.industrial.dto.PushSubscriptionDto;
import com.edgeai.industrial.repository.PushSubscriptionRepository;
import com.edgeai.industrial.security.StoreUserDetails;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
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
class PushControllerTest {

    @Mock private PushSubscriptionRepository subscriptionRepository;
    @InjectMocks private PushController pushController;

    private UUID storeA;
    private UUID storeB;
    private UUID userId;

    @BeforeEach
    void setUp() {
        storeA = UUID.randomUUID();
        storeB = UUID.randomUUID();
        userId = UUID.randomUUID();
        authenticateAs(storeA, userId);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(UUID storeId, UUID user) {
        StoreUserDetails principal = new StoreUserDetails(
                "dono@loja.local", "hash",
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")), storeId, user);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    private PushSubscription existingSubscription(UUID storeId, String endpoint) {
        PushSubscription s = new PushSubscription();
        s.setId(UUID.randomUUID());
        s.setStoreId(storeId);
        s.setUserId(UUID.randomUUID());
        s.setEndpoint(endpoint);
        s.setP256dh("old-p256dh");
        s.setAuth("old-auth");
        s.setFailureCount(4);
        return s;
    }

    @Test
    void subscribingNewEndpointPersistsItForTheAuthenticatedStoreAndUser() {
        String endpoint = "https://push.example/abc";
        when(subscriptionRepository.findByEndpoint(endpoint)).thenReturn(Optional.empty());

        pushController.subscribe(new PushSubscriptionDto(endpoint, "p256dh", "auth"));

        ArgumentCaptor<PushSubscription> captor = ArgumentCaptor.forClass(PushSubscription.class);
        verify(subscriptionRepository).save(captor.capture());
        PushSubscription saved = captor.getValue();
        assertEquals(endpoint, saved.getEndpoint());
        assertEquals("p256dh", saved.getP256dh());
        assertEquals("auth", saved.getAuth());
        assertEquals(storeA, saved.getStoreId());
        assertEquals(userId, saved.getUserId());
        assertEquals(0, saved.getFailureCount());
    }

    @Test
    void resubscribingSameEndpointUnderSameStoreUpdatesTheExistingRowRatherThanCreatingASecond() {
        String endpoint = "https://push.example/abc";
        PushSubscription existing = existingSubscription(storeA, endpoint);
        when(subscriptionRepository.findByEndpoint(endpoint)).thenReturn(Optional.of(existing));

        pushController.subscribe(new PushSubscriptionDto(endpoint, "new-p256dh", "new-auth"));

        ArgumentCaptor<PushSubscription> captor = ArgumentCaptor.forClass(PushSubscription.class);
        verify(subscriptionRepository).save(captor.capture());
        PushSubscription saved = captor.getValue();
        assertEquals(existing.getId(), saved.getId());
        assertEquals("new-p256dh", saved.getP256dh());
        assertEquals("new-auth", saved.getAuth());
        assertEquals(storeA, saved.getStoreId());
        assertEquals(userId, saved.getUserId());
        assertEquals(0, saved.getFailureCount());
    }

    @Test
    void subscribingAnEndpointAlreadyRegisteredToAnotherStoreIsRefused() {
        String endpoint = "https://push.example/abc";
        PushSubscription existing = existingSubscription(storeB, endpoint);
        when(subscriptionRepository.findByEndpoint(endpoint)).thenReturn(Optional.of(existing));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> pushController.subscribe(new PushSubscriptionDto(endpoint, "p256dh", "auth")));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(subscriptionRepository, never()).save(any());
    }

    @Test
    void subscribingWithAMissingKeyIsRefusedWithBadRequest() {
        // Sem p256dh ou auth a mensagem nunca poderia ser cifrada: a inscricao
        // ficaria gravada e muda, e a falha so apareceria na hora do alerta.
        List<PushSubscriptionDto> invalid = List.of(
                new PushSubscriptionDto("", "p256dh", "auth"),
                new PushSubscriptionDto("https://push.example/abc", null, "auth"),
                new PushSubscriptionDto("https://push.example/abc", "  ", "auth"),
                new PushSubscriptionDto("https://push.example/abc", "p256dh", null),
                new PushSubscriptionDto("https://push.example/abc", "p256dh", "  "));

        for (PushSubscriptionDto body : invalid) {
            ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                    () -> pushController.subscribe(body));
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        }

        verifyNoInteractions(subscriptionRepository);
    }

    @Test
    void unsubscribingAnEndpointOfAnotherStoreDoesNotDeleteIt() {
        String endpoint = "https://push.example/abc";
        PushSubscription other = existingSubscription(storeB, endpoint);
        when(subscriptionRepository.findByEndpoint(endpoint)).thenReturn(Optional.of(other));

        pushController.unsubscribe(endpoint);

        verify(subscriptionRepository, never()).delete(any());
    }

    @Test
    void unsubscribingAnEndpointOfTheAuthenticatedStoreDeletesIt() {
        String endpoint = "https://push.example/abc";
        PushSubscription mine = existingSubscription(storeA, endpoint);
        when(subscriptionRepository.findByEndpoint(endpoint)).thenReturn(Optional.of(mine));

        pushController.unsubscribe(endpoint);

        verify(subscriptionRepository).delete(mine);
    }
}
