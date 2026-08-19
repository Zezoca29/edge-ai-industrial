package com.edgeai.industrial.controller;

import com.edgeai.industrial.config.SecurityConfig;
import com.edgeai.industrial.dto.SensorReadingDto;
import com.edgeai.industrial.repository.UserRepository;
import com.edgeai.industrial.security.JwtFilter;
import com.edgeai.industrial.security.JwtService;
import com.edgeai.industrial.security.StoreUserDetails;
import com.edgeai.industrial.security.UserDetailsServiceImpl;
import com.edgeai.industrial.service.SensorService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SensorController.class)
@Import({SecurityConfig.class, JwtFilter.class, UserDetailsServiceImpl.class})
class SensorControllerTest {

    private static final UUID STORE_A = UUID.randomUUID();
    private static final UUID STORE_B = UUID.randomUUID();

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private SensorService sensorService;

    @MockBean
    private JwtService jwtService;

    @MockBean
    private UserRepository userRepository;

    private static StoreUserDetails principal(UUID storeId) {
        return new StoreUserDetails("user@loja.local", "hash",
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")), storeId, UUID.randomUUID());
    }

    @Test
    void getAnomaliesReturns200AndAsksOnlyForTheAuthenticatedStore() throws Exception {
        SensorReadingDto reading = new SensorReadingDto(
                OffsetDateTime.now(), UUID.randomUUID(), "esp32-sim-001",
                "temperature", 78.5, "C", "anomaly", 0.92
        );
        when(sensorService.getAnomalies(STORE_A)).thenReturn(List.of(reading));

        mockMvc.perform(get("/api/sensors/anomalies").with(user(principal(STORE_A))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sensorType").value("temperature"))
                .andExpect(jsonPath("$[0].classification").value("anomaly"));

        verify(sensorService).getAnomalies(STORE_A);
        verify(sensorService, never()).getAnomalies(STORE_B);
    }

    @Test
    void getLatestReturns200AndIsScopedToTheAuthenticatedStore() throws Exception {
        when(sensorService.getLatestPerDevice(STORE_B)).thenReturn(List.of());

        mockMvc.perform(get("/api/sensors/latest").with(user(principal(STORE_B))))
                .andExpect(status().isOk());

        verify(sensorService).getLatestPerDevice(STORE_B);
        verify(sensorService, never()).getLatestPerDevice(STORE_A);
    }

    @Test
    void getRecentIsScopedToTheAuthenticatedStore() throws Exception {
        when(sensorService.getRecentReadings(STORE_A, 60)).thenReturn(List.of());

        mockMvc.perform(get("/api/sensors/recent").with(user(principal(STORE_A))))
                .andExpect(status().isOk());

        verify(sensorService).getRecentReadings(STORE_A, 60);
    }

    @Test
    void readingsForAnArbitraryDeviceIdStillCarryTheCallersStore() throws Exception {
        UUID foreignDeviceId = UUID.randomUUID();
        when(sensorService.getReadings(eq(foreignDeviceId), eq(STORE_A), any(), any()))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/sensors/readings")
                        .param("deviceId", foreignDeviceId.toString())
                        .with(user(principal(STORE_A))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());

        // The store id is never taken from the request, only from the principal.
        verify(sensorService).getReadings(eq(foreignDeviceId), eq(STORE_A), any(), any());
        verify(sensorService, never()).getReadings(any(), eq(STORE_B), any(), any());
    }

    @Test
    void aUserWithoutAStoreGets403RatherThan500() throws Exception {
        mockMvc.perform(get("/api/sensors/anomalies").with(user(principal(null))))
                .andExpect(status().isForbidden());

        verifyNoInteractions(sensorService);
    }
}
