package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.PushSubscription;
import com.edgeai.industrial.repository.PushSubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PushSenderTest {

    @Mock private PushSubscriptionRepository subscriptionRepository;

    private UUID storeId;

    @BeforeEach
    void setUp() {
        storeId = UUID.randomUUID();
    }

    private PushSubscription subscription() {
        PushSubscription s = new PushSubscription();
        s.setId(UUID.randomUUID());
        s.setStoreId(storeId);
        s.setUserId(UUID.randomUUID());
        s.setEndpoint("https://push.example/abc");
        s.setP256dh("chave");
        s.setAuth("segredo");
        s.setFailureCount(0);
        return s;
    }

    /** Subclasse de teste: troca a entrega HTTP real por um codigo fixo. */
    private PushSender senderReturning(int status) {
        return new PushSender(subscriptionRepository, "", "", "mailto:teste@edgeai.local") {
            @Override
            protected int deliver(PushSubscription subscription, String payloadJson) {
                return status;
            }
        };
    }

    @Test
    void aGoneSubscriptionIsDeletedOnTheSpot() {
        PushSubscription sub = subscription();
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of(sub));

        senderReturning(410).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4"));

        verify(subscriptionRepository).delete(sub);
        verify(subscriptionRepository, never()).save(sub);
    }

    @Test
    void aNotFoundSubscriptionIsDeletedToo() {
        PushSubscription sub = subscription();
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of(sub));

        senderReturning(404).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4"));

        verify(subscriptionRepository).delete(sub);
    }

    @Test
    void aTransientFailureKeepsTheSubscriptionAndCountsIt() {
        PushSubscription sub = subscription();
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of(sub));

        senderReturning(500).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4"));

        ArgumentCaptor<PushSubscription> captor = ArgumentCaptor.forClass(PushSubscription.class);
        verify(subscriptionRepository).save(captor.capture());
        assertEquals(1, captor.getValue().getFailureCount());
        verify(subscriptionRepository, never()).delete(sub);
    }

    @Test
    void aSuccessfulSendStampsLastSuccessAndResetsTheCounter() {
        PushSubscription sub = subscription();
        sub.setFailureCount(3);
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of(sub));

        senderReturning(201).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4"));

        ArgumentCaptor<PushSubscription> captor = ArgumentCaptor.forClass(PushSubscription.class);
        verify(subscriptionRepository).save(captor.capture());
        assertEquals(0, captor.getValue().getFailureCount());
        assertNotNull(captor.getValue().getLastSuccessAt());
    }

    @Test
    void aStoreWithNoSubscriptionsIsNotAnError() {
        when(subscriptionRepository.findByStoreId(storeId)).thenReturn(List.of());

        assertDoesNotThrow(() -> senderReturning(201).onAlertOpened(
                new AlertOpenedEvent(UUID.randomUUID(), storeId, "Estoque baixo", "Arroz: restam 4")));
    }
}
