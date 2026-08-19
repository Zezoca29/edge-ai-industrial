package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.mqtt.MqttPublisher;
import com.edgeai.industrial.security.CurrentStore;
import com.edgeai.industrial.service.DeviceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/devices")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceService deviceService;
    private final MqttPublisher mqttPublisher;

    @GetMapping
    public ResponseEntity<List<Device>> listDevices() {
        return ResponseEntity.ok(deviceService.listByStore(CurrentStore.id()));
    }

    /**
     * Publishing to device/command/{name} reaches physical hardware, so the target
     * is resolved through a store-scoped lookup: a name from another store is a 404,
     * never a command on someone else's shelf.
     */
    @PostMapping("/{name}/ping")
    public ResponseEntity<Void> ping(@PathVariable String name) {
        Device device = deviceService.findInStore(name, CurrentStore.id())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Dispositivo nao encontrado nesta loja"));
        mqttPublisher.publish("device/command/" + device.getName(), "{\"command\":\"ping\"}");
        return ResponseEntity.ok().build();
    }
}
