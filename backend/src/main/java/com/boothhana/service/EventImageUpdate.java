package com.boothhana.service;

/** A missing imageKey preserves the existing image. Removal is always explicit. */
public final class EventImageUpdate {
    private EventImageUpdate() {}
    public static String resolve(String previous, String proposed, Boolean removeImage) {
        if (Boolean.TRUE.equals(removeImage)) return null;
        return proposed == null || proposed.isBlank() ? previous : proposed;
    }
}
