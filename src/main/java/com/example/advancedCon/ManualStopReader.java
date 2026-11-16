package com.example.advancedCon;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

import com.example.advancedCon.Dtos.ManualStop;

/**
 * Checks the stops typed in on the page and turns them into {@link Stop}s.
 *
 * This is the typed-in counterpart of {@link ExcelStopReader}. Problems are
 * reported by stop number, the same number the user sees on the page, so they
 * can go straight to the row that needs fixing.
 */
@Component
public class ManualStopReader {

    static final int MAX_STOPS = 1000;
    static final int MAX_NAME_LENGTH = 120;

    public List<Stop> read(List<ManualStop> entries) {
        if (entries == null || entries.isEmpty()) {
            throw new InvalidStopFileException("Add at least one stop.");
        }
        if (entries.size() > MAX_STOPS) {
            throw new InvalidStopFileException(
                    "Too many stops. The most that can be converted at once is " + MAX_STOPS + ".");
        }

        List<Stop> stops = new ArrayList<>();
        for (int i = 0; i < entries.size(); i++) {
            int number = i + 1;
            ManualStop entry = entries.get(i);
            if (entry == null) {
                throw new InvalidStopFileException("Stop " + number + ": the stop is empty.");
            }

            // Line breaks or repeated spaces in a name would only make a messy CSV.
            String name = entry.name() == null ? "" : entry.name().trim().replaceAll("\\s+", " ");
            if (name.isEmpty()) {
                throw new InvalidStopFileException("Stop " + number + ": the station name is missing.");
            }
            if (name.length() > MAX_NAME_LENGTH) {
                throw new InvalidStopFileException(
                        "Stop " + number + " (" + name + "): the station name is longer than "
                                + MAX_NAME_LENGTH + " characters.");
            }

            stops.add(new Stop(
                    name,
                    coordinate(entry.latitude(), "latitude", number, name, 90),
                    coordinate(entry.longitude(), "longitude", number, name, 180)));
        }
        return stops;
    }

    private static double coordinate(Double value, String what, int number, String name, int limit) {
        if (value == null) {
            throw new InvalidStopFileException("Stop " + number + " (" + name + "): the " + what + " is missing.");
        }
        if (!Double.isFinite(value) || Math.abs(value) > limit) {
            throw new InvalidStopFileException("Stop " + number + " (" + name + "): the " + what
                    + " must be between -" + limit + " and " + limit + ".");
        }
        return value;
    }
}