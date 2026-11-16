package com.example.advancedCon;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Builds the contents of Go.csv from a list of stops.
 *
 * The layout copies the example file exactly: UTF-8 with a BOM, Windows (CRLF)
 * line endings, the same 15 columns, and coordinates converted with
 * {@link CoordinateConverter}.
 */
@Component
public class GoCsvWriter {

    private static final byte[] UTF8_BOM = { (byte) 0xEF, (byte) 0xBB, (byte) 0xBF };
    private static final String EOL = "\r\n";
    private static final String HEADER = "INDEX,NAME,LAT,LONG,CLUE,AD,EXP,SPEED,MILEAGE,TYPE,OUTVOICE,,,,NAME_MP3";

    private final CoordinateConverter converter;
    private final int speed;
    private final int firstMileage;
    private final int mileage;
    private final String outVoice;

    public GoCsvWriter(CoordinateConverter converter,
            @Value("${go.speed:80}") int speed,
            @Value("${go.first-mileage:100}") int firstMileage,
            @Value("${go.mileage:30}") int mileage,
            @Value("${go.outvoice:NO}") String outVoice) {
        this.converter = converter;
        this.speed = speed;
        this.firstMileage = firstMileage;
        this.mileage = mileage;
        this.outVoice = outVoice;
    }

    public byte[] write(List<Stop> stops) {
        if (stops.isEmpty()) {
            throw new InvalidStopFileException("No bus stops were found in the Excel file.");
        }

        StringBuilder csv = new StringBuilder(HEADER).append(EOL);
        int last = stops.size() - 1;

        for (int i = 0; i < stops.size(); i++) {
            Stop stop = stops.get(i);
            String type = i == 0 ? "StartStation" : (i == last ? "EndStation" : "OrdinaryStation");

            csv.append(i).append(',')
                    .append(escape(stop.name())).append(',')
                    .append(format(converter.convertCoordinate(stop.latitude()))).append(',')
                    .append(format(converter.convertCoordinate(stop.longitude())))
                    .append(",,,,") // CLUE, AD, EXP are left empty
                    .append(speed).append(',')
                    .append(i == 0 ? firstMileage : mileage).append(',')
                    .append(type).append(',')
                    .append(outVoice)
                    .append(",,,,") // three unnamed empty columns
                    .append(escape(stop.name())) // NAME_MP3
                    .append(EOL);
        }

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(UTF8_BOM);
        out.writeBytes(csv.toString().getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }

    /**
     * 2559.065 stays 2559.065, 2559.840 becomes 2559.84, 2600.000 becomes 2600 (as
     * in the example).
     */
    private static String format(double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }

    /** Quotes a value only when it contains a comma, quote or line break. */
    private static String escape(String value) {
        if (value.indexOf(',') >= 0 || value.indexOf('"') >= 0
                || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0) {
            return '"' + value.replace("\"", "\"\"") + '"';
        }
        return value;
    }
}