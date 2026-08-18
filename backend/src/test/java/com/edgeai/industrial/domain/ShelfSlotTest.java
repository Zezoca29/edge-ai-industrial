package com.edgeai.industrial.domain;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class ShelfSlotTest {

    @Test
    void newSlotDefaultsToIndexZeroAndNoProduct() {
        ShelfSlot slot = new ShelfSlot();
        assertEquals(Short.valueOf((short) 0), slot.getSlotIndex());
        assertNull(slot.getProductId(), "um slot novo nasce sem produto configurado");
        assertEquals(0.0, slot.getTareG(), 0.0001);
        assertEquals(3, slot.getMinQty());
        assertFalse(slot.getSuspect());
    }

    @Test
    void slotHoldsDeviceAndProductBinding() {
        UUID deviceId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        ShelfSlot slot = new ShelfSlot();
        slot.setDeviceId(deviceId);
        slot.setProductId(productId);
        slot.setCurrentQty(7);

        assertEquals(deviceId, slot.getDeviceId());
        assertEquals(productId, slot.getProductId());
        assertEquals(7, slot.getCurrentQty());
    }
}
