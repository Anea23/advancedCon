package com.example.advancedCon;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.springframework.stereotype.Service;

/**
 * Converts a decimal-degree coordinate to the degrees-and-decimal-minutes
 * format (DDMM.mmm / DDDMM.mmm) using the same formula as the Excel sheet:
 *
 * result = (degrees * 100) + ((|value| - degrees) * 60)
 *
 * BigDecimal is used so results are exact to 3 decimal places.
 */
@Service
public class CoordinateConverter {

    private static final BigDecimal SIXTY = BigDecimal.valueOf(60);
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    public double convertCoordinate(double coordinate) {
        // Step 1: work with the absolute value (sign is dropped by this formula)
        BigDecimal absolute = BigDecimal.valueOf(Math.abs(coordinate));

        // Step 2: whole degrees
        BigDecimal degrees = absolute.setScale(0, RoundingMode.DOWN);

        // Step 3: decimal minutes, rounded to 3 places
        BigDecimal minutes = absolute.subtract(degrees)
                .multiply(SIXTY)
                .setScale(3, RoundingMode.HALF_UP);

        // Guard: minutes can round up to 60.000 (e.g. 10.99999999) -> carry into
        // degrees
        if (minutes.compareTo(SIXTY) >= 0) {
            degrees = degrees.add(BigDecimal.ONE);
            minutes = BigDecimal.ZERO;
        }

        // Step 4: apply the formula, 3 decimal places
        return degrees.multiply(HUNDRED)
                .add(minutes)
                .setScale(3, RoundingMode.HALF_UP)
                .doubleValue();
    }
}
