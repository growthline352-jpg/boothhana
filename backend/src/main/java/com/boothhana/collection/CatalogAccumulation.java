package com.boothhana.collection;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;

/** A partial search is an observation, never a deletion instruction. */
public final class CatalogAccumulation {
    private CatalogAccumulation() {}
    public static Sales snapshot(Sales latest,Sales previous,List<ProductData> persistedProducts) {
        Sales head=latest!=null?latest:previous;
        if(head==null) return null;
        // Products are the accumulated normalized table, NOT just latest.products().
        return new Sales(head.summary(),head.evidenceScope(),head.categories(),head.subjects(),head.salesMethod(),
            head.sources(),head.images(),List.copyOf(persistedProducts),head.warnings());
    }
    public static ProductCheck check(boolean seenThisAttempt,String lastSeen) {
        return new ProductCheck(seenThisAttempt?"CONFIRMED_CURRENT":"NOT_RECONFIRMED",lastSeen);
    }
}
