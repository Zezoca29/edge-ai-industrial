package com.edgeai.industrial.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ShelfCalculatorTest {

    @Test
    void computeExactMultipleGivesFullConfidence() {
        ShelfCalculator.Result r = ShelfCalculator.compute(1000.0, 0.0, 200.0, 5.0);
        assertEquals(5.0, r.rawUnits(), 0.0001);
        assertEquals(5, r.roundedQty());
        assertEquals(1.0, r.confidence(), 0.0001);
        assertFalse(r.suspect());
    }

    @Test
    void computeSubtractsTareBeforeCounting() {
        ShelfCalculator.Result r = ShelfCalculator.compute(1200.0, 200.0, 200.0, 5.0);
        assertEquals(5, r.roundedQty());
        assertFalse(r.suspect());
    }

    @Test
    void computeHalfwayBetweenUnitsGivesZeroConfidenceAndIsSuspect() {
        ShelfCalculator.Result r = ShelfCalculator.compute(900.0, 0.0, 200.0, 5.0);
        assertEquals(4.5, r.rawUnits(), 0.0001);
        assertEquals(0.0, r.confidence(), 0.0001);
        assertTrue(r.suspect(), "100g de resto contra tolerancia de 5g deve ser suspeito");
    }

    @Test
    void computeSmallNoiseWithinToleranceIsNotSuspect() {
        ShelfCalculator.Result r = ShelfCalculator.compute(1003.0, 0.0, 200.0, 5.0);
        assertEquals(5, r.roundedQty());
        assertFalse(r.suspect());
        assertTrue(r.confidence() > 0.9);
    }

    @Test
    void computeEmptyShelfGivesZero() {
        ShelfCalculator.Result r = ShelfCalculator.compute(200.0, 200.0, 200.0, 5.0);
        assertEquals(0, r.roundedQty());
        assertFalse(r.suspect());
    }

    @Test
    void computeBelowTareSaturatesAtZeroAndFlagsSuspect() {
        ShelfCalculator.Result r = ShelfCalculator.compute(150.0, 200.0, 200.0, 5.0);
        assertEquals(0, r.roundedQty());
        assertTrue(r.suspect(), "peso abaixo da tara significa bandeja removida");
    }

    @Test
    void nextQtyKeepsCurrentInsideDeadband() {
        assertEquals(5, ShelfCalculator.nextQty(5, 4.7));
        assertEquals(5, ShelfCalculator.nextQty(5, 5.3));
    }

    @Test
    void nextQtyMovesOutsideDeadband() {
        assertEquals(4, ShelfCalculator.nextQty(5, 4.3));
        assertEquals(6, ShelfCalculator.nextQty(5, 5.8));
    }

    @Test
    void nextQtyInitializesWhenCurrentIsNull() {
        assertEquals(5, ShelfCalculator.nextQty(null, 4.7));
    }

    @Test
    void nextQtyNeverGoesNegative() {
        assertEquals(0, ShelfCalculator.nextQty(2, -0.4));
    }

    @Test
    void residualExactlyEqualToToleranceIsNotSuspect() {
        // Powers of two so the residual is exact in binary: 1032 - 4*256 = 8g,
        // which is precisely the tolerance. The guard is strict `>`.
        ShelfCalculator.Result r = ShelfCalculator.compute(1032.0, 0.0, 256.0, 8.0);
        assertEquals(4, r.roundedQty());
        assertFalse(r.suspect(), "resto igual a tolerancia ainda esta dentro do aceito");
    }

    @Test
    void residualOneGramAboveToleranceIsSuspect() {
        ShelfCalculator.Result r = ShelfCalculator.compute(1033.0, 0.0, 256.0, 8.0);
        assertEquals(4, r.roundedQty());
        assertTrue(r.suspect(), "9g de resto contra tolerancia de 8g deve ser suspeito");
    }

    @Test
    void nextQtyAtExactlyTheDeadbandEdgeKeepsTheCurrentCount() {
        // The deadband is a strict `<`, but 0.6 has no exact binary representation:
        // |5 - 4.4| evaluates to 0.5999999999999996, so the nominal edge still holds.
        // Pinned deliberately — a drop must clear the edge, not merely reach it.
        assertEquals(5, ShelfCalculator.nextQty(5, 4.4));
        assertEquals(5, ShelfCalculator.nextQty(5, 5.6));
    }

    @Test
    void nextQtyJustPastTheDeadbandEdgeMoves() {
        assertEquals(4, ShelfCalculator.nextQty(5, 4.375));   // 0.625 unidades abaixo
        assertEquals(6, ShelfCalculator.nextQty(5, 5.625));   // 0.625 unidades acima
    }

    @Test
    void toGramsConvertsKilogramsAndPassesGramsThrough() {
        assertEquals(1500.0, ShelfCalculator.toGrams(1.5, "kg"), 0.0001);
        assertEquals(1500.0, ShelfCalculator.toGrams(1500.0, "g"), 0.0001);
        assertEquals(1500.0, ShelfCalculator.toGrams(1.5, null), 0.0001);
    }
}
