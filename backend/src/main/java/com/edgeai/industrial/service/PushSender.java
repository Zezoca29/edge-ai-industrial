package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.PushSubscription;
import com.edgeai.industrial.repository.PushSubscriptionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.security.Security;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Delivers an opened alert to the store's registered browsers.
 *
 * <p>Runs after the alert row is committed and off the caller's thread: the
 * alert is the record, the push is only delivery. A push service that is slow
 * or down must never hold up sensor ingestion, and must never cost us the
 * alert itself.
 */
@Slf4j
@Component
public class PushSender {

    private final PushSubscriptionRepository subscriptionRepository;
    private final ObjectMapper objectMapper;
    private final String publicKey;
    private final String privateKey;
    private final String subject;

    public PushSender(PushSubscriptionRepository subscriptionRepository,
                      ObjectMapper objectMapper,
                      @Value("${push.vapid.public-key:}") String publicKey,
                      @Value("${push.vapid.private-key:}") String privateKey,
                      @Value("${push.vapid.subject:mailto:admin@edgeai.local}") String subject) {
        this.subscriptionRepository = subscriptionRepository;
        this.objectMapper = objectMapper;
        this.publicKey = publicKey;
        this.privateKey = privateKey;
        this.subject = subject;
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new org.bouncycastle.jce.provider.BouncyCastleProvider());
        }
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onAlertOpened(AlertOpenedEvent event) {
        List<PushSubscription> subscriptions = subscriptionRepository.findByStoreId(event.storeId());
        if (subscriptions.isEmpty()) {
            // Not an error: this is the state before anyone has enabled alerts.
            log.debug("Store {} has no push subscriptions; alert {} recorded only",
                    event.storeId(), event.alertId());
            return;
        }

        String payload;
        try {
            payload = objectMapper.writeValueAsString(
                    new PushPayload(event.title(), event.body(), "/dashboard/alertas"));
        } catch (JsonProcessingException e) {
            // A malformed payload can never reach the browser as JSON, so there is
            // nothing to send — but the alert itself is already committed and safe.
            log.warn("Failed to serialize push payload for alert {}: {}", event.alertId(), e.getMessage());
            return;
        }

        for (PushSubscription subscription : subscriptions) {
            try {
                record(subscription, deliver(subscription, payload));
            } catch (RuntimeException e) {
                // deliver() already contains HTTP failures; this catches the
                // bookkeeping around it (a repository save that fails, an
                // unexpected error). One browser must not cost the shopkeeper the
                // notification on his other devices.
                log.warn("Push bookkeeping for subscription {} failed: {}", subscription.getId(), e.toString());
            }
        }
    }

    private void record(PushSubscription subscription, int status) {
        if (status == 404 || status == 410) {
            // The subscription is dead — most often because the origin changed.
            subscriptionRepository.delete(subscription);
            log.info("Removed dead push subscription {}", subscription.getId());
        } else if (status >= 200 && status < 300) {
            subscription.setFailureCount(0);
            subscription.setLastSuccessAt(OffsetDateTime.now());
            subscriptionRepository.save(subscription);
        } else {
            subscription.setFailureCount(subscription.getFailureCount() + 1);
            subscriptionRepository.save(subscription);
            log.warn("Push to subscription {} failed with status {}", subscription.getId(), status);
        }
    }

    /** Overridable so the delivery policy can be tested without a network. */
    protected int deliver(PushSubscription subscription, String payloadJson) {
        if (publicKey.isBlank() || privateKey.isBlank()) {
            log.warn("VAPID keys are not configured; push disabled");
            return 0;
        }
        try {
            PushService pushService = new PushService(publicKey, privateKey, subject);
            Notification notification = new Notification(
                    subscription.getEndpoint(), subscription.getP256dh(),
                    subscription.getAuth(), payloadJson.getBytes());
            return pushService.send(notification).getStatusLine().getStatusCode();
        } catch (Exception e) {
            log.warn("Push delivery to {} threw: {}", subscription.getId(), e.getMessage());
            return 500;
        }
    }

    /** Serialized with Jackson so no raw control character can ever produce malformed JSON. */
    private record PushPayload(String title, String body, String url) {
    }
}
