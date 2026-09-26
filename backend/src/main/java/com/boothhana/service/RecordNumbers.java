package com.boothhana.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/** Display-only identifier. Never use a reservation number as authorization. */
public final class RecordNumbers {
    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyMMdd-HHmmss").withZone(ZoneOffset.UTC);
    private RecordNumbers() {}
    public static String create(String prefix) {
        if (!"RSV".equals(prefix) && !"POS".equals(prefix)) throw new IllegalArgumentException("Unknown prefix");
        return prefix + "-" + FORMAT.format(Instant.now()) + "-" + UUID.randomUUID().toString().replace("-", "");
    }
}
