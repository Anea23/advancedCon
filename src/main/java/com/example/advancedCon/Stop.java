package com.example.advancedCon;

/** One bus stop read from the Excel file (coordinates in decimal degrees). */
public record Stop(String name, double latitude, double longitude) {
}