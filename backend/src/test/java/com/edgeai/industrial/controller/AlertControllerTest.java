package com.edgeai.industrial.controller;

import com.edgeai.industrial.domain.Alert;
import com.edgeai.industrial.domain.Device;
import com.edgeai.industrial.dto.AlertDto;
import com.edgeai.industrial.repository.DeviceRepository;
import com.edgeai.industrial.security.StoreUserDetails;
import com.edgeai.industrial.service.AlertService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AlertControllerTest {

    @Mock private AlertService alertService;
    @Mock private DeviceRepository deviceRepository;
    @InjectMocks private AlertController alertController;

    private UUID storeA;
    private UUID storeB;
    private UUID userId;

    @BeforeEach
    void setUp() {
        storeA = UUID.randomUUID();
        storeB = UUID.randomUUID();
        userId = UUID.randomUUID();
        authenticateAs(storeA, userId);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(UUID storeId, UUID user) {
        StoreUserDetails principal = new StoreUserDetails(
                "dono@loja.local", "hash",
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")), storeId, user);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    private Alert alert() {
        return alert(UUID.randomUUID());
    }

    private Alert alert(UUID deviceId) {
        Alert a = new Alert();
        a.setId(UUID.randomUUID());
        a.setStoreId(storeA);
        a.setDeviceId(deviceId);
        a.setAlertType(AlertService.TYPE_STOCK_LOW);
        a.setSeverity("high");
        a.setMessage("Arroz 5 kg: restam 4 unidades, minimo 5");
        a.setAcknowledged(false);
        return a;
    }

    @Test
    void listAsksOnlyForTheAuthenticatedStore() {
        when(alertService.list(storeA, true)).thenReturn(List.of(alert()));

        List<AlertDto> result = alertController.list(true);

        assertEquals(1, result.size());
        assertEquals("high", result.get(0).severity());
        verify(alertService).list(storeA, true);
    }

    @Test
    void listNeverReachesAnotherStore() {
        authenticateAs(storeB, userId);
        when(alertService.list(storeB, true)).thenReturn(List.of());

        assertTrue(alertController.list(true).isEmpty());
        verify(alertService, never()).list(eq(storeA), anyBoolean());
    }

    @Test
    void acknowledgePassesTheAuthenticatedUserAndStore() {
        UUID alertId = UUID.randomUUID();

        alertController.acknowledge(alertId);

        verify(alertService).acknowledge(alertId, storeA, userId);
    }

    /** The dashboard groups alerts under the bancada that raised them, so the
     *  device has to travel with the alert. Matching on the message text is
     *  guesswork; the id is already on the entity. */
    @Test
    void listCarriesTheDeviceThatRaisedTheAlert() {
        UUID deviceId = UUID.randomUUID();
        when(alertService.list(storeA, true)).thenReturn(List.of(alert(deviceId)));
        when(deviceRepository.findByStoreIdOrderByNameAsc(storeA))
                .thenReturn(List.of(device(deviceId, "wokwi-shelf-001")));

        AlertDto dto = alertController.list(true).get(0);

        assertEquals(deviceId, dto.deviceId());
        assertEquals("wokwi-shelf-001", dto.deviceName());
    }

    /** A device deleted after the alert was raised must not blow up the list. */
    @Test
    void listSurvivesAnAlertWhoseDeviceIsGone() {
        when(alertService.list(storeA, true)).thenReturn(List.of(alert()));
        when(deviceRepository.findByStoreIdOrderByNameAsc(storeA)).thenReturn(List.of());

        AlertDto dto = alertController.list(true).get(0);

        assertNotNull(dto.deviceId());
        assertNull(dto.deviceName());
    }

    private Device device(UUID id, String name) {
        Device d = new Device();
        d.setId(id);
        d.setName(name);
        return d;
    }

    @Test
    void countReturnsTheOpenTotalForTheStore() {
        when(alertService.countOpen(storeA)).thenReturn(3L);

        assertEquals(3L, alertController.count().get("open"));
    }
}
