package com.boothhana.support;

import java.math.BigDecimal;
import java.util.*;

/** Versioned content evidence, independent from publication timestamps and presentation ordering.
 * Never reconstruct old report evidence from today's map. Unknown legacy evidence is not comparable.
 */
public final class SupportComparison {
    public static final String VERSION = "FLOORPLAN_CONTENT_V2";
    public static final String BUSINESS_VERSION = "BUSINESS_CONTENT_V3";
    private SupportComparison() {}

    /** Only reported business fields are evidence of a correction. Provenance stays in the
     * received snapshot, never in this projection. Old snapshots are reprojected as-is;
     * no historical evidence is populated from today's database. */
    public static Optional<Map<String,Object>> business(Map<String,Object> snapshot,
            SupportModels.Target target, String reason) {
        if (!(snapshot.get("data") instanceof Map<?,?>) || target == null) return Optional.empty();
        Map<String,Object> data = map(snapshot.get("data"));
        if ("FLOORPLAN".equals(target.type())) {
            if (!isV2(snapshot) && !BUSINESS_VERSION.equals(snapshot.get("comparisonVersion")))
                return Optional.empty(); // legacy whole-map reports omitted geometry
            try { return Optional.of(floorplan(data, target.areaId())); }
            catch (IllegalArgumentException missing) { return Optional.empty(); }
        }
        Map<String,Object> out = new TreeMap<>();
        out.put("namespace", target.namespace()); out.put("type", target.type());
        out.put("reason", reason == null ? "OTHER" : reason);
        boolean location = "PARTICIPATION_LOCATION".equals(reason);
        boolean schedule = "SCHEDULE_PLACE".equals(reason);
        boolean price = "PRODUCT_PRICE".equals(reason);
        if ("CATALOG".equals(target.namespace())) {
            switch (target.type()) {
                case "EVENT" -> {
                    if (!data.containsKey("name")) return Optional.empty();
                    if (schedule) {
                        copy(out,data,"venueName","address","occurrences");
                        out.put("operationStatus", operation(data.get("operationStatus")));
                    } else {
                        copy(out,data,"name","subcategory","organizer","edition","region","venueName","address",
                            "description","admission","subjects","occurrences","eventFormat");
                        out.put("operationStatus", operation(data.get("operationStatus")));
                    }
                }
                case "PARTICIPANT" -> {
                    Map<String,Object> participant = map(data.get("participant"));
                    if (!participant.containsKey("registrationName")) return Optional.empty();
                    if (location || schedule) {
                        out.put("locations", locations(participant.get("locations")));
                    } else if (price) {
                        out.put("products", products(data.get("productRows"),true));
                    } else {
                        out.put("participant", pick(participant,"registrationName","kind","members","subjects","description"));
                        out.put("locations",locations(participant.get("locations")));
                        out.put("sales",pick(map(data.get("sales")),"summary","evidenceScope","categories","subjects","salesMethod"));
                        out.put("products",products(data.get("productRows"),false));
                    }
                }
                case "PRODUCT" -> {
                    Map<String,Object> product = map(data.get("data"));
                    if (!product.containsKey("name")) return Optional.empty();
                    // A product wrapper cannot prove a booth location or event date correction.
                    if (location || schedule) return Optional.empty();
                    out.put("product", product(product, price));
                }
                case "ASSET" -> {
                    if (!data.containsKey("type")) return Optional.empty();
                    copy(out,data,"type","url","storedUrl","imageUrl","sha256","caption","credit");
                }
                default -> { return Optional.empty(); }
            }
        } else if ("PLATFORM".equals(target.namespace())) {
            switch (target.type()) {
                case "EVENT" -> {
                    if (schedule) copy(out,data,"startAt","endAt","venue","status");
                    else copy(out,data,"name","startAt","endAt","venue","description","status","imageUrl");
                }
                case "BOOTH" -> {
                    if(location || schedule) copy(out,data,"eventId","boothNumber","status","isPublic");
                    else copy(out,data,"name","creatorName","boothNumber","intro","imageUrl","snsUrl","status","isPublic");
                }
                case "PRODUCT" -> {
                    if(location || schedule) return Optional.empty();
                    if(price) copy(out,data,"price","soldOut");
                    else copy(out,data,"name","description","imageUrl","price","soldOut","isPublic","reservationEnabled");
                }
                default -> { return Optional.empty(); }
            }
        } else return Optional.empty();
        return Optional.of(out);
    }

    private static Map<String,Object> operation(Object value) {
        // Some historical snapshots stored only a state enum. Never infer cancellation from prose.
        if(value instanceof String state && Set.of("UNKNOWN","SCHEDULED","CANCELED","POSTPONED","RESCHEDULED").contains(state)) {
            Map<String,Object> result=new TreeMap<>();result.put("state",state);result.put("note",null);return result;
        }
        return pick(map(value),"state","note");
    }
    private static Map<String,Object> product(Map<String,Object> p, boolean priceOnly) {
        Map<String,Object> out = new TreeMap<>();
        copy(out,p,"saleState","evidenceScope");
        Map<String,Object> amount=pick(map(p.get("price")),"amount","currency","note");
        Object raw=amount.get("amount");
        if(raw instanceof String text && text.matches("[0-9]+(?:\\.[0-9]+)?")) amount.put("amount",new BigDecimal(text).stripTrailingZeros());
        out.put("price",amount); // checkedOn and numeric formatting are NOT corrections
        if(!priceOnly) copy(out,p,"name","summary","memberName","categories","subjects","productUrl");
        return out;
    }
    private static List<Map<String,Object>> products(Object rows,boolean priceOnly) {
        return maps(rows).stream().map(row -> {
            Map<String,Object> out=new TreeMap<>();
            out.put("id",normalized(row.get("id")));
            out.put("content",product(map(row.get("data")),priceOnly));
            return out;
        }).sorted(Comparator.comparing(Object::toString)).toList();
    }
    private static List<Map<String,Object>> locations(Object value) {
        return maps(value).stream().map(l->pick(l,"code","status","hall","zone","startDate","endDate"))
            .sorted(Comparator.comparing(Object::toString)).toList();
    }
    private static Map<String,Object> pick(Map<String,Object> source,String...keys) {
        Map<String,Object> out=new TreeMap<>();copy(out,source,keys);return out;
    }
    private static void copy(Map<String,Object> out,Map<String,Object> source,String...keys) {
        for(String key:keys) out.put(key,normalized(source.get(key)));
    }


    public static boolean isV2(Map<String,Object> snapshot) {
        return VERSION.equals(snapshot.get("comparisonVersion"))
            && snapshot.get("comparisonData") instanceof Map<?,?>;
    }

    public static Map<String,Object> floorplan(Map<String,Object> plan, String areaId) {
        Map<String,Object> out = new TreeMap<>();
        // Stable content only. IDs, publishedAt, source page labels, credits and temporary URLs
        // are provenance, not evidence that the reported position was corrected.
        out.put("state", plan.get("state"));
        out.put("scope", scope(plan.get("scope")));
        out.put("width", normalized(plan.get("width")));
        out.put("height", normalized(plan.get("height")));
        Object imageHash = plan.get("sourceSha256");
        out.put("imageIdentity", imageHash == null ? plan.get("imageUrl") : imageHash);
        boolean selected = areaId != null && !areaId.isBlank();
        out.put("coverage", selected ? "SELECTED_AREA" : "WHOLE_PLAN");
        if (selected) {
            Object shape = plan.get("selectedShape");
            if (!(shape instanceof Map<?,?>)) throw new IllegalArgumentException("Missing selected map area");
            out.put("shapes", List.of(shape(map(shape))));
        } else {
            if (!(plan.get("shapes") instanceof List<?>)) throw new IllegalArgumentException("Missing whole map geometry");
            List<Map<String,Object>> shapes = maps(plan.get("shapes")).stream().map(SupportComparison::shape)
                .sorted(Comparator.comparing(m -> Objects.toString(m.get("id"), ""))).toList();
            out.put("shapes", shapes);
        }
        return out;
    }

    private static Map<String,Object> scope(Object value) {
        Map<String,Object> original = map(value), out = new TreeMap<>();
        for (String key : List.of("hall", "zone", "scopeStatus")) out.put(key, original.get(key));
        Object days = original.get("dates");
        out.put("dates", days instanceof List<?> l ? l.stream().map(Object::toString).distinct().sorted().toList() : List.of());
        return out;
    }

    private static Map<String,Object> shape(Map<String,Object> input) {
        Map<String,Object> out = new TreeMap<>();
        for (String key : List.of("id", "label", "status")) out.put(key, input.get(key));
        // Polygon point order is geometry; never sort vertices independently.
        out.put("points", normalized(input.get("points")));
        List<Map<String,Object>> links = maps(input.get("links")).stream().map(link -> {
            Map<String,Object> safe = new TreeMap<>();
            for (String key : List.of("participantId", "date", "day", "hall", "zone", "boothNumber"))
                if (link.containsKey(key)) safe.put(key, normalized(link.get(key)));
            Object days = link.get("dates");
            safe.put("dates", days instanceof List<?> l ? l.stream().map(Object::toString).distinct().sorted().toList() : List.of());
            return safe;
        }).sorted(Comparator.comparing(Object::toString)).toList();
        out.put("links", links);
        return out;
    }

    private static Object normalized(Object value) {
        if (value instanceof Number n) return new BigDecimal(n.toString()).stripTrailingZeros();
        if (value instanceof List<?> l) return l.stream().map(SupportComparison::normalized).toList();
        if (value instanceof Map<?,?> m) {
            Map<String,Object> out = new TreeMap<>();
            m.forEach((k,v) -> out.put(k.toString(), normalized(v)));
            return out;
        }
        return value;
    }
    @SuppressWarnings("unchecked") private static Map<String,Object> map(Object value) {
        return value instanceof Map<?,?> ? (Map<String,Object>) value : Map.of();
    }
    private static List<Map<String,Object>> maps(Object value) {
        return value instanceof List<?> l ? l.stream().map(SupportComparison::map).toList() : List.of();
    }
}
