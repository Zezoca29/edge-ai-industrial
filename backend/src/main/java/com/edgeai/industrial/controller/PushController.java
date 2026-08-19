package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.PushSubscription;
import com.edgeai.industrial.dto.PushSubscriptionDto;
import com.edgeai.industrial.repository.PushSubscriptionRepository;
import com.edgeai.industrial.security.CurrentStore;
import com.edgeai.industrial.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/push")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class PushController {

    private final PushSubscriptionRepository subscriptionRepository;

    @Value("${push.vapid.public-key:}")
    private String publicKey;

    @GetMapping("/public-key")
    public Map<String, String> publicKey() {
        if (publicKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Notificacoes nao configuradas neste servidor");
        }
        return Map.of("publicKey", publicKey);
    }

    /** Re-subscribing from the same browser updates the row rather than duplicating it. */
    @PostMapping("/subscriptions")
    public void subscribe(@RequestBody PushSubscriptionDto body) {
        if (body.endpoint() == null || body.endpoint().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inscricao invalida");
        }
        PushSubscription subscription = subscriptionRepository.findByEndpoint(body.endpoint())
                .orElseGet(PushSubscription::new);
        subscription.setEndpoint(body.endpoint());
        subscription.setP256dh(body.p256dh());
        subscription.setAuth(body.auth());
        subscription.setStoreId(CurrentStore.id());
        subscription.setUserId(CurrentUser.id());
        subscription.setFailureCount(0);
        subscriptionRepository.save(subscription);
    }

    @DeleteMapping("/subscriptions")
    public void unsubscribe(@RequestParam String endpoint) {
        subscriptionRepository.findByEndpoint(endpoint)
                .filter(s -> s.getStoreId().equals(CurrentStore.id()))
                .ifPresent(subscriptionRepository::delete);
    }
}
