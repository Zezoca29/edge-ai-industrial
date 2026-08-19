package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.domain.ShelfSlot;
import com.edgeai.industrial.repository.DeviceRepository;
import com.edgeai.industrial.repository.PickEventRepository;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.repository.ShelfSlotRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Owns the business rule the firmware used to own: which product sits on a
 * shelf, how many units are left, and whether a drop is a real pick.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShelfService {

    private static final Short DEFAULT_SLOT = 0;

    private final ShelfSlotRepository shelfSlotRepository;
    private final ProductRepository productRepository;
    private final PickEventRepository pickEventRepository;
    private final DeviceRepository deviceRepository;

    @Transactional
    public void processWeight(UUID deviceId, OffsetDateTime time, double weightG, boolean stable) {
        if (!stable) {
            return;
        }

        ShelfSlot slot = resolveSlot(deviceId);
        if (slot == null) {
            log.warn("Could not resolve nor create shelf slot {} for device {}; reading dropped",
                    DEFAULT_SLOT, deviceId);
            return;
        }

        if (slot.getProductId() == null) {
            // A slot without a product still tracks its raw weight: taring an empty
            // shelf happens at install time, before anyone knows what goes on it.
            recordWeightOnly(slot, weightG);
            return;
        }

        Optional<Product> maybeProduct = productRepository.findById(slot.getProductId());
        if (maybeProduct.isEmpty()) {
            log.warn("Shelf slot {} of device {} points at product {} which no longer exists; "
                            + "weight recorded, unit count skipped",
                    slot.getId(), deviceId, slot.getProductId());
            recordWeightOnly(slot, weightG);
            return;
        }
        Product product = maybeProduct.get();

        // A device may only feed slots of its own store. Rejected at consumption,
        // not at the controller — the MQTT path never passes through one.
        UUID deviceStoreId = deviceRepository.findById(deviceId).map(d -> d.getStoreId()).orElse(null);
        if (deviceStoreId == null || !product.getStoreId().equals(deviceStoreId)) {
            log.warn("Device {} (store {}) reported weight for slot {} bound to product {} of store {}; rejected",
                    deviceId, deviceStoreId, slot.getId(), product.getId(), product.getStoreId());
            return;
        }

        ShelfCalculator.Result result = ShelfCalculator.compute(
                weightG, slot.getTareG(), product.getUnitWeightG(), product.getToleranceG());

        Integer previousQty = slot.getCurrentQty();
        int nextQty = ShelfCalculator.nextQty(previousQty, result.rawUnits());

        slot.setCurrentWeightG(weightG);
        slot.setCurrentQty(nextQty);
        slot.setSuspect(result.suspect());
        shelfSlotRepository.save(slot);

        // Only a trustworthy drop is a sale. A suspect reading (tray lifted off the
        // cell, weight below the tare) would otherwise invent a full-stock pick and
        // poison the demand chart, exactly like a restock would.
        if (previousQty != null && nextQty < previousQty && !result.suspect()) {
            int picked = previousQty - nextQty;
            double weightDeltaKg = picked * product.getUnitWeightG() / 1000.0;
            pickEventRepository.saveDerived(deviceId, time, product.getStoreId(), product.getId(),
                    product.getName(), picked, weightDeltaKg, result.confidence());
        }
    }

    private void recordWeightOnly(ShelfSlot slot, double weightG) {
        slot.setCurrentWeightG(weightG);
        shelfSlotRepository.save(slot);
    }

    /**
     * A device reporting for the first time after the migration ran would otherwise
     * never get a slot, and the dashboard would show nothing for it forever. Create
     * it unconfigured; no pick event is ever invented.
     */
    private ShelfSlot resolveSlot(UUID deviceId) {
        Optional<ShelfSlot> existing = shelfSlotRepository.findByDeviceIdAndSlotIndex(deviceId, DEFAULT_SLOT);
        if (existing.isPresent()) {
            return existing.get();
        }

        ShelfSlot created = new ShelfSlot();
        created.setDeviceId(deviceId);
        created.setSlotIndex(DEFAULT_SLOT);
        try {
            // saveAndFlush, not save: shelf_slots has UNIQUE (device_id, slot_index),
            // and two consumer threads for the same device both see an empty Optional.
            // Deferring the insert to commit would throw outside this catch.
            shelfSlotRepository.saveAndFlush(created);
            return created;
        } catch (DataIntegrityViolationException e) {
            log.debug("Lost the race creating shelf slot {} for device {}; re-reading",
                    DEFAULT_SLOT, deviceId);
            return shelfSlotRepository.findByDeviceIdAndSlotIndex(deviceId, DEFAULT_SLOT).orElse(null);
        }
    }
}
