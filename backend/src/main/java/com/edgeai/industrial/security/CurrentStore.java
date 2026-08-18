package com.edgeai.industrial.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

/** Reads the authenticated user's store from the security context. */
public final class CurrentStore {

    private CurrentStore() {
    }

    public static UUID id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof StoreUserDetails details)) {
            throw new IllegalStateException("No authenticated store user in context");
        }
        if (details.getStoreId() == null) {
            throw new IllegalStateException("Authenticated user has no store assigned");
        }
        return details.getStoreId();
    }
}
