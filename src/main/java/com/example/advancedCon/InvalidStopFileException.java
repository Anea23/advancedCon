package com.example.advancedCon;

/**
 * Thrown when the stops (from an Excel file or typed in) cannot be turned into
 * a Go.csv.
 * Becomes a 400 response whose message is shown to the user.
 */
public class InvalidStopFileException extends RuntimeException {

    public InvalidStopFileException(String message) {
        super(message);
    }
}
