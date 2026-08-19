package com.edgeai.industrial.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/** Reads the authenticated user's store from the security context. */
public final class CurrentStore {

    private CurrentStore() {
    }

    /**
     * Fails closed, but as a 403 and not a 500: a user without a store is a
     * configuration problem the operator can act on, not a crash.
     */
    public static UUID id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof StoreUserDetails details)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Usuário sem loja vinculada");
        }
        if (details.getStoreId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Usuário sem loja vinculada");
        }
        return details.getStoreId();
    }
}
