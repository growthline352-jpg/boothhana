package com.boothhana.interests;

import com.boothhana.api.ApiException;
import com.boothhana.interests.TaxonomyRegistry.Option;
import java.util.*;

/** One registry for onboarding, account settings and published-catalogue matching.
 * Topics use reviewed subject labels only; event names are never classification input. */
public final class InterestTaxonomy {
    private InterestTaxonomy() {}
    public record Field(String code,String label,List<Option> formats,List<Option> topics) {}
    public record Selection(List<String> formats,List<String> topics) {
        public Selection { formats=formats==null?List.of():Collections.unmodifiableList(new ArrayList<>(formats));topics=topics==null?List.of():Collections.unmodifiableList(new ArrayList<>(topics)); }
        public boolean empty(){return formats.isEmpty()&&topics.isEmpty();}
    }
    public static final List<Field> FIELDS=TaxonomyRegistry.FIELDS.stream()
        .map(f -> new Field(f.code(),f.label(),f.formats(),f.topics())).toList();
    public static Field field(String category){return FIELDS.stream().filter(f->f.code().equals(category)).findFirst().orElseThrow(()->ApiException.badRequest("행사 분야를 확인해 주세요."));}
    public static Map<String,Selection> validate(Map<String,Selection> fields){
        if(fields==null||fields.size()>3)throw ApiException.badRequest("관심 분야를 확인해 주세요.");
        Map<String,Selection> result=new LinkedHashMap<>();
        fields.forEach((category,selection)->{
            Field options=field(category);if(selection==null)throw ApiException.badRequest("관심 항목을 확인해 주세요.");
            validateCodes(selection.formats(),options.formats());validateCodes(selection.topics(),options.topics());result.put(category,selection);
        });return Collections.unmodifiableMap(result);
    }
    private static void validateCodes(List<String> codes,List<Option> options){
        if(codes.size()>options.size()||new HashSet<>(codes).size()!=codes.size()||codes.stream().anyMatch(code->options.stream().noneMatch(o->o.code().equals(code))))
            throw ApiException.badRequest("해당 분야의 관심 항목을 선택해 주세요.");
    }
    /** Caller-supplied codes become bound values through the fixed registry. Apply before LIMIT. */
    public static String predicate(String category,Selection selection,String alias,List<Object> args){
        if(selection==null||selection.empty())return "true";
        Field field=field(category);validate(Map.of(category,selection));
        List<Option> chosen=new ArrayList<>();
        field.formats().stream().filter(o->selection.formats().contains(o.code())).forEach(chosen::add);
        field.topics().stream().filter(o->selection.topics().contains(o.code())).forEach(chosen::add);
        List<String> clauses=new ArrayList<>();
        for(Option option:chosen){
            if(!option.types().isEmpty()){clauses.add(alias+".snapshot_json->'event'->>'subcategory' in ("+marks(option.types().size())+")");args.addAll(option.types());}
            {
                var aliases=new LinkedHashSet<String>();aliases.add(option.code().toLowerCase(Locale.ROOT));
                option.subjects().forEach(value->aliases.add(value.toLowerCase(Locale.ROOT)));
                clauses.add("exists(select 1 from jsonb_array_elements_text(coalesce("+alias+".snapshot_json->'event'->'subjects','[]'::jsonb)) topic(value) where lower(trim(topic.value)) in ("+marks(aliases.size())+"))");
                args.addAll(aliases);
            }
        }return "("+String.join(" or ",clauses)+")";
    }
    private static String marks(int n){return String.join(",",Collections.nCopies(n,"?"));}
}
