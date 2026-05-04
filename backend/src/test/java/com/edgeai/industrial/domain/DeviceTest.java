package com.edgeai.industrial.domain;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class DeviceTest {

    @Test
    void deviceIsOnlineWhenStatusIsOnline() {
        Device device = new Device();
        device.setStatus("online");
        assertThat(device.getStatus()).isEqualTo("online");
    }
}
