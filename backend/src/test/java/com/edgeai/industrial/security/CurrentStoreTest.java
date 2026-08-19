package com.edgeai.industrial.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CurrentStoreTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void throwsWhenNoAuthenticationInContext() {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(CurrentStore::id)
                .isInstanceOf(ResponseStatusException.class)
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ResponseStatusException::getStatusCode)
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void throwsWhenPrincipalIsNotStoreUserDetails() {
        var auth = new UsernamePasswordAuthenticationToken("plain-user", null, List.of());
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThatThrownBy(CurrentStore::id)
                .isInstanceOf(ResponseStatusException.class)
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ResponseStatusException::getStatusCode)
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void throwsWhenStoreUserDetailsHasNullStoreId() {
        StoreUserDetails details = new StoreUserDetails("user@edgeai.local", "hash", List.of(), null);
        var auth = new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThatThrownBy(CurrentStore::id)
                .isInstanceOf(ResponseStatusException.class)
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ResponseStatusException::getStatusCode)
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void returnsStoreIdWhenPresent() {
        UUID storeId = UUID.randomUUID();
        StoreUserDetails details = new StoreUserDetails("user@edgeai.local", "hash", List.of(), storeId);
        var auth = new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(auth);

        assertThat(CurrentStore.id()).isEqualTo(storeId);
    }
}
