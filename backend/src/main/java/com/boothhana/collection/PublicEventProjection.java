package com.boothhana.collection;

import java.util.List;
import java.util.Objects;
import static com.boothhana.collection.CollectionModels.EventData;

/** The public copy removes remote image candidates, not reviewed operational facts. */
public final class PublicEventProjection {
    private PublicEventProjection() {}
    public static EventData fromReviewed(EventData raw) {
        Objects.requireNonNull(raw, "reviewed event");
        return new EventData(raw.name(), raw.subcategory(), raw.organizer(), raw.edition(), raw.region(),
            raw.venueName(), raw.address(), raw.description(), raw.admission(), raw.subjects(),
            raw.occurrences(), raw.sources(), List.of(), raw.warnings(), raw.eventFormat(),
            raw.discoveryLinks(), raw.operationStatus(), raw.visitorGuide(), raw.districts());
    }
}
