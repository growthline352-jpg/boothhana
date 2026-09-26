package com.boothhana.collection;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;

/** Removing an override means follow the newest source; assigning JSON null is a different action. */
public final class CatalogReviewRules {
    private CatalogReviewRules() {}
    public static Map<String,Object> apply(Map<String,Object> existing,EditInput input) {
        Map<String,Object> values=new LinkedHashMap<>(existing);
        input.clearOverrides().forEach(values::remove);
        values.putAll(input.overrides());return values;
    }
}
