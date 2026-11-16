package com.example.advancedCon;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.advancedCon.Dtos.ConversionResult;
import com.example.advancedCon.Dtos.CoordinateRequest;

import jakarta.validation.Valid;

/** Converts one latitude/longitude pair. Nothing is stored. */
@RestController
@RequestMapping("/api/coordinates")
public class CoordinateController {

    private final CoordinateConverter converter;

    public CoordinateController(CoordinateConverter converter) {
        this.converter = converter;
    }

    @PostMapping("/convert")
    public ConversionResult convert(@Valid @RequestBody CoordinateRequest request) {
        return new ConversionResult(
                converter.convertCoordinate(request.latitude()),
                converter.convertCoordinate(request.longitude()));
    }
}
