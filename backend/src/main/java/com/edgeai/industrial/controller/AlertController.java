package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.dto.AlertDto;
import com.edgeai.industrial.repository.DeviceRepository;
import com.edgeai.industrial.security.CurrentStore;
import com.edgeai.industrial.security.CurrentUser;
import com.edgeai.industrial.service.AlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/alerts")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;
    private final DeviceRepository deviceRepository;

    @GetMapping
    public List<AlertDto> list(@RequestParam(defaultValue = "true") boolean onlyOpen) {
        UUID storeId = CurrentStore.id();
        // One lookup for the whole page instead of one per alert: an alert list
        // is short, but the device list is shorter still and already indexed by
        // store.
        Map<UUID, String> names = new HashMap<>();
        for (Device d : deviceRepository.findByStoreIdOrderByNameAsc(storeId)) {
            names.put(d.getId(), d.getName());
        }
        return alertService.list(storeId, onlyOpen)
                .stream().map(a -> toDto(a, names.get(a.getDeviceId()))).toList();
    }

    @GetMapping("/count")
    public Map<String, Long> count() {
        return Map.of("open", alertService.countOpen(CurrentStore.id()));
    }

    @PostMapping("/{id}/acknowledge")
    public void acknowledge(@PathVariable UUID id) {
        alertService.acknowledge(id, CurrentStore.id(), CurrentUser.id());
    }

    private static AlertDto toDto(Alert a, String deviceName) {
        return new AlertDto(a.getId(), a.getDeviceId(), deviceName,
                a.getAlertType(), a.getSeverity(), a.getMessage(),
                Boolean.TRUE.equals(a.getAcknowledged()), a.getCreatedAt(), a.getResolvedAt());
    }
}
