package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Store;
import com.edgeai.industrial.repository.StoreRepository;
import com.edgeai.industrial.security.CurrentStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/stores")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class StoreController {

    private final StoreRepository storeRepository;

    @GetMapping("/me")
    public Map<String, Object> me() {
        Store store = storeRepository.findById(CurrentStore.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
        return Map.of(
                "id", store.getId(),
                "name", store.getName(),
                "timezone", store.getTimezone()
        );
    }
}
