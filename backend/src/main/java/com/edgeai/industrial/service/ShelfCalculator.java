package com.edgeai.industrial.service;

/**
 * Pure domain logic: converts an absolute shelf weight into a unit count.
 *
 * The absolute weight is the source of truth. A missed reading or a bad
 * delta never desynchronises the stock permanently — the next good
 * reading corrects it.
 */
public final class ShelfCalculator {

    /** A qty change is only accepted once the reading is this far from the current count. */
    private static final double DEADBAND_UNITS = 0.6;

    private ShelfCalculator() {
    }

    public record Result(double rawUnits, int roundedQty, double confidence, boolean suspect) {
    }

    public static Result compute(double weightG, double tareG, double unitWeightG, double toleranceG) {
        double netG = weightG - tareG;

        if (netG < -toleranceG) {
            // Below tare: the tray itself was removed. Never report negative stock.
            return new Result(0.0, 0, 0.0, true);
        }
        if (netG < 0.0) {
            netG = 0.0;
        }

        double rawUnits = netG / unitWeightG;
        int roundedQty = (int) Math.round(rawUnits);

        double residualUnits = Math.abs(rawUnits - roundedQty);
        double confidence = Math.max(0.0, 1.0 - 2.0 * residualUnits);
        boolean suspect = residualUnits * unitWeightG > toleranceG;

        return new Result(rawUnits, roundedQty, confidence, suspect);
    }

    public static int nextQty(Integer currentQty, double rawUnits) {
        int rounded = Math.max(0, (int) Math.round(rawUnits));
        if (currentQty == null) {
            return rounded;
        }
        if (Math.abs(rawUnits - currentQty) < DEADBAND_UNITS) {
            return currentQty;
        }
        return rounded;
    }

    public static double toGrams(double value, String unit) {
        if (unit != null && unit.equalsIgnoreCase("g")) {
            return value;
        }
        return value * 1000.0;
    }
}
