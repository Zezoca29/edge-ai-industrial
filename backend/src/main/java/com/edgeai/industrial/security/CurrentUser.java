package com.edgeai.industrial.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/** Reads the authenticated user's id from the security context. */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static UUID id() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof StoreUserDetails details)
                || details.getUserId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Usuario nao identificado");
        }
        return details.getUserId();
    }
}
