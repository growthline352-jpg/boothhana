package com.boothhana.interests;

import java.util.*;

/** Generated registry shared with the collector and web app; event names are never input. */
public final class TaxonomyRegistry {
    private TaxonomyRegistry() {}
    public record EventType(String code, String label) {}
    public record Field(String key, String code, String label, List<EventType> types,
                        List<InterestTaxonomy.Option> formats, List<InterestTaxonomy.Option> topics) {}
    public static final List<Field> FIELDS = TaxonomyRegistryData.fields();

    public static Optional<Field> forType(String type) {
        return FIELDS.stream().filter(f -> f.types().stream().anyMatch(t -> t.code().equals(type))).findFirst();
    }
    public static boolean matches(InterestTaxonomy.Option option, String type, List<String> subjects) {
        if (option.types().contains(type)) return true;
        var aliases = new HashSet<String>();
        aliases.add(option.code().toLowerCase(Locale.ROOT));
        option.subjects().forEach(s -> aliases.add(s.trim().toLowerCase(Locale.ROOT)));
        return subjects.stream().anyMatch(s -> aliases.contains(s.trim().toLowerCase(Locale.ROOT)));
    }
    /** Review hints, not fabricated tags or a reason to remove an otherwise valid public event. */
    public static List<String> reviewIssues(String type, List<String> subjects) {
        var field = forType(type);
        if (field.isEmpty()) return List.of();
        var values = subjects == null ? List.<String>of() : subjects.stream().filter(s -> s != null && !s.isBlank()).toList();
        if (values.isEmpty()) return List.of("취향 주제 확인 필요: 주제 태그가 비어 있습니다.");
        List<String> issues = new ArrayList<>();
        if (field.get().topics().stream().noneMatch(o -> matches(o,type,values)))
            issues.add("취향 주제 확인 필요: 연결되는 관심 주제가 없습니다.");
        var formatCodes = new HashSet<String>();
        field.get().formats().forEach(o -> formatCodes.add(o.code()));
        field.get().topics().forEach(o -> formatCodes.remove(o.code()));
        if (values.stream().allMatch(s -> formatCodes.contains(s.trim())))
            issues.add("취향 주제 확인 필요: 행사 유형 코드만 입력되어 있습니다.");
        return List.copyOf(issues);
    }
}
