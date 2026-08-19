package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.dto.AlertDto;
import com.edgeai.industrial.security.CurrentStore;
import com.edgeai.industrial.security.CurrentUser;
import com.edgeai.industrial.service.AlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/alerts")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class AlertController {

    private final AlertService alertService;

    @GetMapping
    public List<AlertDto> list(@RequestParam(defaultValue = "true") boolean onlyOpen) {
        return alertService.list(CurrentStore.id(), onlyOpen)
                .stream().map(AlertController::toDto).toList();
    }

    @GetMapping("/count")
    public Map<String, Long> count() {
        return Map.of("open", alertService.countOpen(CurrentStore.id()));
    }

    @PostMapping("/{id}/acknowledge")
    public void acknowledge(@PathVariable UUID id) {
        alertService.acknowledge(id, CurrentStore.id(), CurrentUser.id());
    }

    private static AlertDto toDto(Alert a) {
        return new AlertDto(a.getId(), a.getAlertType(), a.getSeverity(), a.getMessage(),
                Boolean.TRUE.equals(a.getAcknowledged()), a.getCreatedAt(), a.getResolvedAt());
    }
}
