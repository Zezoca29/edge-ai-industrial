package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.PushSubscription;
import com.edgeai.industrial.repository.PushSubscriptionRepository;
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
    private final String publicKey;
    private final String privateKey;
    private final String subject;

    public PushSender(PushSubscriptionRepository subscriptionRepository,
                      @Value("${push.vapid.public-key:}") String publicKey,
                      @Value("${push.vapid.private-key:}") String privateKey,
                      @Value("${push.vapid.subject:mailto:admin@edgeai.local}") String subject) {
        this.subscriptionRepository = subscriptionRepository;
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

        String payload = String.format(
                "{\"title\":\"%s\",\"body\":\"%s\",\"url\":\"/dashboard/alerts\"}",
                escape(event.title()), escape(event.body()));

        for (PushSubscription subscription : subscriptions) {
            int status = deliver(subscription, payload);
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

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
