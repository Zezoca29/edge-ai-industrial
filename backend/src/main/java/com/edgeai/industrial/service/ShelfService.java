package com.edgeai.industrial.service;

import com.edgeai.industrial.domain.Product;
import com.edgeai.industrial.domain.ShelfSlot;
import com.edgeai.industrial.repository.DeviceRepository;
import com.edgeai.industrial.repository.PickEventRepository;
import com.edgeai.industrial.repository.ProductRepository;
import com.edgeai.industrial.repository.ShelfSlotRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * Owns the business rule the firmware used to own: which product sits on a
 * shelf, how many units are left, and whether a drop is a real pick.
 */
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

        Optional<ShelfSlot> maybeSlot = shelfSlotRepository.findByDeviceIdAndSlotIndex(deviceId, DEFAULT_SLOT);
        if (maybeSlot.isEmpty()) {
            // A device reporting for the first time after the migration ran would
            // otherwise never get a slot, and the dashboard would show nothing for
            // it forever. Create it unconfigured; no pick event is ever invented.
            ShelfSlot newSlot = new ShelfSlot();
            newSlot.setDeviceId(deviceId);
            newSlot.setSlotIndex(DEFAULT_SLOT);
            shelfSlotRepository.save(newSlot);
            return;
        }
        ShelfSlot slot = maybeSlot.get();
        if (slot.getProductId() == null) {
            return;
        }

        Optional<Product> maybeProduct = productRepository.findById(slot.getProductId());
        if (maybeProduct.isEmpty()) {
            return;
        }
        Product product = maybeProduct.get();

        // A device may only feed slots of its own store. Rejected at consumption,
        // not at the controller — the MQTT path never passes through one.
        boolean sameStore = deviceRepository.findById(deviceId)
                .map(d -> product.getStoreId().equals(d.getStoreId()))
                .orElse(false);
        if (!sameStore) {
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

        if (previousQty != null && nextQty < previousQty) {
            int picked = previousQty - nextQty;
            double weightDeltaKg = picked * product.getUnitWeightG() / 1000.0;
            pickEventRepository.saveDerived(deviceId, time, product.getStoreId(), product.getId(),
                    product.getName(), picked, weightDeltaKg, result.confidence());
        }
    }
}
