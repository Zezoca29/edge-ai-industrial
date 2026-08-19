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
import java.util.Optional;

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

    /**
     * Re-subscribing from the same browser updates the row rather than duplicating it.
     *
     * <p>Push endpoint URLs are not secrets, so a row belonging to another store is a
     * reachable case, not a paranoia case: an authenticated user of one store could
     * submit another store's endpoint and, if we overwrote it, redirect that store's
     * alert content to their own browser. There is exactly one store per subscription
     * and no legitimate flow that hands the same endpoint to two stores, so a mismatch
     * is refused outright rather than silently rescoped.
     */
    @PostMapping("/subscriptions")
    public void subscribe(@RequestBody PushSubscriptionDto body) {
        // All three fields are required to encrypt a payload. Accepting a row with a
        // missing key would persist a subscription that can never deliver anything
        // and only fails later, deep inside the push library.
        if (isBlank(body.endpoint()) || isBlank(body.p256dh()) || isBlank(body.auth())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inscricao invalida");
        }
        Optional<PushSubscription> existing = subscriptionRepository.findByEndpoint(body.endpoint());
        if (existing.isPresent() && !existing.get().getStoreId().equals(CurrentStore.id())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Este dispositivo ja esta registrado para outra loja");
        }
        PushSubscription subscription = existing.orElseGet(PushSubscription::new);
        subscription.setEndpoint(body.endpoint());
        subscription.setP256dh(body.p256dh());
        subscription.setAuth(body.auth());
        subscription.setStoreId(CurrentStore.id());
        subscription.setUserId(CurrentUser.id());
        subscription.setFailureCount(0);
        subscriptionRepository.save(subscription);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    @DeleteMapping("/subscriptions")
    public void unsubscribe(@RequestParam String endpoint) {
        subscriptionRepository.findByEndpoint(endpoint)
                .filter(s -> s.getStoreId().equals(CurrentStore.id()))
                .ifPresent(subscriptionRepository::delete);
    }
}
