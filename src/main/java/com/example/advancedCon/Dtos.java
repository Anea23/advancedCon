package com.example.advancedCon;

import java.util.List;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

/** Request and response objects for the API. */
public final class Dtos {

    private Dtos() {
    }

    public record CoordinateRequest(
            @NotNull(message = "Latitude is required.") @DecimalMin(value = "-90", message = "Latitude must be between -90 and 90.") @DecimalMax(value = "90", message = "Latitude must be between -90 and 90.") Double latitude,

            @NotNull(message = "Longitude is required.") @DecimalMin(value = "-180", message = "Longitude must be between -180 and 180.") @DecimalMax(value = "180", message = "Longitude must be between -180 and 180.") Double longitude) {
    }

    public record ConversionResult(double latitude, double longitude) {
    }

    /**
     * One stop typed in by hand. The fields are allowed to be null here so that
     * {@link ManualStopReader} can say exactly which stop and which value is
     * missing.
     */
    public record ManualStop(String name, Double latitude, Double longitude) {
    }

    /**
     * The stops typed in on the page, in the order they should appear in Go.csv.
     */
    public record ManualStopsRequest(List<ManualStop> stops) {
    }
}