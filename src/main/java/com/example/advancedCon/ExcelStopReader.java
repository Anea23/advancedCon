package com.example.advancedCon;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;

/**
 * Reads the bus stops from the first sheet of an Excel file.
 *
 * The columns are found by their header text ("Station Name", "Latitude",
 * "Longitude"), so it does not matter which column they are in. The header row
 * is looked for in the first rows of the sheet, because the sheet may start
 * with a title row (e.g. "C1AOutboundBus Stop").
 */
@Component
public class ExcelStopReader {

    private static final int HEADER_SEARCH_ROWS = 15;

    private final DataFormatter formatter = new DataFormatter();

    public List<Stop> read(InputStream in) {
        try (Workbook workbook = WorkbookFactory.create(in)) {
            return parse(workbook.getSheetAt(0));
        } catch (InvalidStopFileException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            throw new InvalidStopFileException("Could not read the file. Please upload a valid .xlsx Excel file.");
        }
    }

    private List<Stop> parse(Sheet sheet) {
        int headerRowIndex = -1;
        int nameCol = -1;
        int latCol = -1;
        int lonCol = -1;

        int searchLimit = Math.min(sheet.getLastRowNum(), HEADER_SEARCH_ROWS);
        for (int r = sheet.getFirstRowNum(); r <= searchLimit && headerRowIndex < 0; r++) {
            Row row = sheet.getRow(r);
            if (row == null) {
                continue;
            }
            Map<String, Integer> headers = new HashMap<>();
            for (Cell cell : row) {
                headers.put(text(cell).toLowerCase(Locale.ROOT), cell.getColumnIndex());
            }
            int n = find(headers, "station name", "stop name", "name");
            int la = find(headers, "latitude", "lat");
            int lo = find(headers, "longitude", "long", "lon");
            if (n >= 0 && la >= 0 && lo >= 0) {
                headerRowIndex = r;
                nameCol = n;
                latCol = la;
                lonCol = lo;
            }
        }

        if (headerRowIndex < 0) {
            throw new InvalidStopFileException(
                    "Could not find the header row. The sheet needs the columns "
                            + "\"Station Name\", \"Longitude\" and \"Latitude\".");
        }

        List<Stop> stops = new ArrayList<>();
        for (int r = headerRowIndex + 1; r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) {
                continue;
            }
            String name = text(row.getCell(nameCol));
            String lat = text(row.getCell(latCol));
            String lon = text(row.getCell(lonCol));

            if (name.isEmpty() && lat.isEmpty() && lon.isEmpty()) {
                continue; // blank row
            }
            int excelRow = r + 1;
            if (name.isEmpty()) {
                throw new InvalidStopFileException("Row " + excelRow + ": the station name is missing.");
            }
            stops.add(new Stop(
                    name,
                    number(row.getCell(latCol), "latitude", name, excelRow, 90),
                    number(row.getCell(lonCol), "longitude", name, excelRow, 180)));
        }
        return stops;
    }

    private static int find(Map<String, Integer> headers, String... names) {
        for (String name : names) {
            Integer col = headers.get(name);
            if (col != null) {
                return col;
            }
        }
        return -1;
    }

    private String text(Cell cell) {
        return cell == null ? "" : formatter.formatCellValue(cell).trim();
    }

    /** Reads a coordinate that may be stored as a real number or as text. */
    private double number(Cell cell, String what, String stopName, int excelRow, double limit) {
        if (cell == null) {
            throw new InvalidStopFileException("Row " + excelRow + " (" + stopName + "): the " + what + " is missing.");
        }
        CellType type = cell.getCellType() == CellType.FORMULA
                ? cell.getCachedFormulaResultType()
                : cell.getCellType();

        double value;
        if (type == CellType.NUMERIC) {
            value = cell.getNumericCellValue();
        } else {
            String raw = text(cell).replace(',', '.');
            try {
                value = Double.parseDouble(raw);
            } catch (NumberFormatException e) {
                throw new InvalidStopFileException("Row " + excelRow + " (" + stopName + "): the " + what
                        + " \"" + raw + "\" is not a number.");
            }
        }
        if (!Double.isFinite(value) || Math.abs(value) > limit) {
            throw new InvalidStopFileException("Row " + excelRow + " (" + stopName + "): the " + what
                    + " must be between -" + (int) limit + " and " + (int) limit + ".");
        }
        return value;
    }
}