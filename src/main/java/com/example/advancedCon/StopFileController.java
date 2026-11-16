package com.example.advancedCon;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.example.advancedCon.Dtos.ManualStopsRequest;

/**
 * Turns a list of bus stops into Go.csv with converted coordinates.
 * The stops come either from an uploaded Excel file or from the page itself.
 */
@RestController
@RequestMapping("/api/stops")
public class StopFileController {

    private static final String OUTPUT_FILE_NAME = "Go.csv";

    private final ExcelStopReader excelReader;
    private final ManualStopReader manualReader;
    private final GoCsvWriter writer;

    public StopFileController(ExcelStopReader excelReader, ManualStopReader manualReader, GoCsvWriter writer) {
        this.excelReader = excelReader;
        this.manualReader = manualReader;
        this.writer = writer;
    }

    /** Stops read from an uploaded .xlsx file. */
    @PostMapping(value = "/convert", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> convert(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new InvalidStopFileException("Please choose an Excel (.xlsx) file.");
        }

        List<Stop> stops;
        try (InputStream in = file.getInputStream()) {
            stops = excelReader.read(in);
        }
        return csvResponse(stops);
    }

    /** Stops typed in by hand on the page. */
    @PostMapping(value = "/convert-manual", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<byte[]> convertManual(@RequestBody ManualStopsRequest request) {
        return csvResponse(manualReader.read(request.stops()));
    }

    private ResponseEntity<byte[]> csvResponse(List<Stop> stops) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(OUTPUT_FILE_NAME).build().toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(writer.write(stops));
    }
}
