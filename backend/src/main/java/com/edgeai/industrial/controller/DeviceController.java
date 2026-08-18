package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.mqtt.MqttPublisher;
import com.edgeai.industrial.service.DeviceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
        return ResponseEntity.ok(deviceService.listAll());
    }

    @PostMapping("/{name}/ping")
    public ResponseEntity<Void> ping(@PathVariable String name) {
        mqttPublisher.publish("device/command/" + name, "{\"command\":\"ping\"}");
        return ResponseEntity.ok().build();
    }
}
