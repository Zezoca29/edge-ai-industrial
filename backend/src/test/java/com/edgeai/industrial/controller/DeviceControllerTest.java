package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.mqtt.MqttPublisher;
import com.edgeai.industrial.security.StoreUserDetails;
import com.edgeai.industrial.service.DeviceService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DeviceControllerTest {

    @Mock private DeviceService deviceService;
    @Mock private MqttPublisher mqttPublisher;
    @InjectMocks private DeviceController deviceController;

    private UUID storeA;
    private UUID storeB;

    @BeforeEach
    void setUp() {
        storeA = UUID.randomUUID();
        storeB = UUID.randomUUID();
        authenticateAs(storeA);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(UUID storeId) {
        StoreUserDetails principal = new StoreUserDetails(
                "user@loja.local", "hash",
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")), storeId);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    private Device device(String name, UUID storeId) {
        Device d = new Device();
        d.setId(UUID.randomUUID());
        d.setName(name);
        d.setDeviceType("esp32");
        d.setStoreId(storeId);
        return d;
    }

    @Test
    void listReturnsOnlyDevicesOfTheAuthenticatedStore() {
        when(deviceService.listByStore(storeA)).thenReturn(List.of(device("esp32-a", storeA)));

        List<Device> body = deviceController.listDevices().getBody();

        assertNotNull(body);
        assertEquals(1, body.size());
        assertEquals("esp32-a", body.get(0).getName());
        verify(deviceService).listByStore(storeA);
        verify(deviceService, never()).listByStore(storeB);
    }

    @Test
    void listFollowsWhoeverIsAuthenticated() {
        authenticateAs(storeB);
        when(deviceService.listByStore(storeB)).thenReturn(List.of());

        assertTrue(deviceController.listDevices().getBody().isEmpty());
        verify(deviceService, never()).listByStore(storeA);
    }

    @Test
    void pingPublishesToADeviceOfTheAuthenticatedStore() {
        when(deviceService.findInStore("esp32-a", storeA))
                .thenReturn(Optional.of(device("esp32-a", storeA)));

        deviceController.ping("esp32-a");

        verify(mqttPublisher).publish("device/command/esp32-a", "{\"command\":\"ping\"}");
    }

    @Test
    void pingOnADeviceOfAnotherStoreIs404AndNeverReachesTheHardware() {
        when(deviceService.findInStore("esp32-da-loja-b", storeA)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> deviceController.ping("esp32-da-loja-b"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verifyNoInteractions(mqttPublisher);
    }
}
