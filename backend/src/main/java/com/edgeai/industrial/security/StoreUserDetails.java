package com.edgeai.industrial.security;

import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;

import java.util.Collection;
import java.util.UUID;

/** UserDetails that carries the store the user belongs to. */
@Getter
public class StoreUserDetails extends org.springframework.security.core.userdetails.User {

    private final UUID storeId;
    private final UUID userId;

    public StoreUserDetails(String username, String password,
                            Collection<? extends GrantedAuthority> authorities,
                            UUID storeId, UUID userId) {
        super(username, password, authorities);
        this.storeId = storeId;
        this.userId = userId;
    }
}
