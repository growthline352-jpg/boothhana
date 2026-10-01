package com.boothhana.collection;

import java.net.URI;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.Source;
import static com.boothhana.collection.CollectionRules.*;

/** Evidence order is not identity. IDs are scoped to the source system AND to the parent DB row.
 * Conservative legacy aliases preserve links on upgrade; ambiguous existing matches are not merged. */
public final class CatalogIdentity {
    private CatalogIdentity() {}
    public static String canonical(String value) {
        url(value);
        URI u=URI.create(value).normalize();
        String host=u.getHost().toLowerCase(Locale.ROOT),scheme=u.getScheme().toLowerCase(Locale.ROOT);
        int port=u.getPort();
        String authority=host+((port<0||port==443&&scheme.equals("https")||port==80&&scheme.equals("http"))?"":":"+port);
        String path=u.getRawPath();if(path==null||path.isEmpty()) path="/";
        // Preserve significant query parameters (including entry/page identifiers).
        String query=u.getRawQuery();
        if(query!=null) query=Arrays.stream(query.split("&")).filter(v->!v.toLowerCase(Locale.ROOT).matches("(?:utm_[^=]*|fbclid|gclid)=.*")).sorted().reduce((a,b)->a+"&"+b).orElse("");
        return scheme+"://"+authority+path+(query==null||query.isEmpty()?"":"?"+query);
    }
    public static String system(String value) {
        URI u=URI.create(canonical(value));
        return u.getScheme()+"://"+u.getRawAuthority();
    }
    public static void validate(Identity i,String legacy,List<Source> sources) {
        if(i==null) return;
        require(i.sourceSystem()!=null&&i.sourceSystem().equals(system(i.sourceSystem())),"sourceSystem은 확인된 출처의 origin이어야 합니다.");
        text(i.entryId(),300,true);if(i.entryId()!=null) require(!i.entryId().isBlank(),"빈 외부 ID");
        require(i.entryId()!=null||i.detailUrl()!=null,"외부 ID 또는 개별 상세 URL 필요");
        if(legacy!=null&&i.entryId()!=null) require(legacy.equals(i.entryId()),"외부 ID 불일치");
        require(sources.stream().anyMatch(s->!"INACCESSIBLE".equals(s.access())&&system(s.url()).equals(i.sourceSystem())),"식별 출처 근거 없음");
        if(i.detailUrl()!=null) {
            require(system(i.detailUrl()).equals(i.sourceSystem()),"상세 URL 출처 불일치");
            require(sources.stream().anyMatch(s->canonical(s.url()).equals(canonical(i.detailUrl()))),"상세 URL의 원문 근거 필요");
        }
    }
    private static String idKey(String type,String origin,String id) { return sha(type+":id\u001f"+origin+"\u001f"+id); }
    private static List<String> keys(String type,Identity i,String legacy,String name,String detail,List<Source> sources) {
        LinkedHashSet<String> keys=new LinkedHashSet<>();
        // Participant matching is already scoped to one event. Keep one conservative
        // normalized-name alias so the official roster and a social booth-info post
        // can converge without treating a booth number as identity.
        if(type.equals("participant")) keys.add(sha("participant:name\u001f"+normalize(name)));
        if(i!=null&&i.entryId()!=null) keys.add(idKey(type,i.sourceSystem(),i.entryId()));
        if(i!=null&&i.detailUrl()!=null) keys.add(sha(type+":url\u001f"+canonical(i.detailUrl())));
        if(detail!=null) keys.add(sha(type+":url\u001f"+canonical(detail)));
        // Legacy records have no explicit namespace. Only one authoritative origin is unambiguous.
        if(i==null&&legacy!=null&&!legacy.isBlank()) {
            var systems=sources.stream().filter(s->!"INACCESSIBLE".equals(s.access())&&Set.of("OFFICIAL","VENUE","ORGANIZER_SOCIAL").contains(s.kind())).map(s->system(s.url())).distinct().sorted().toList();
            if(systems.isEmpty()) systems=sources.stream().map(s->system(s.url())).distinct().sorted().toList();
            if(systems.size()==1) keys.add(idKey(type,systems.getFirst(),legacy));
        }
        // Every evidence URL is an alias; its array position is immaterial. With an explicit
        // namespace, don't attach that system's entry ID to an unrelated site's URL.
        sources.stream().map(Source::url).sorted().forEach(source->{
            if(i!=null&&!system(source).equals(i.sourceSystem())) return;
            String id=i!=null?i.entryId():legacy;
            if(id!=null&&!id.isBlank()) keys.add(sha(source+"\u001f"+id)); // v4 exact hash
            else if(i==null) keys.add(sha(normalize(name)+"\u001f"+source));
        });
        if(type.equals("product")&&i==null&&(legacy==null||legacy.isBlank())) keys.add(sha(normalize(name)+"\u001f"+Objects.toString(detail,"")));
        require(!keys.isEmpty(),"안정적인 식별 근거 없음");return List.copyOf(keys);
    }
    public static List<String> participantKeys(Participant p) { return keys("participant",p.identity(),p.sourceEntryId(),p.registrationName(),null,p.sources()); }
    public static List<String> productKeys(ProductData p) { return keys("product",p.identity(),p.sourceEntryId(),p.name(),p.productUrl(),p.sources()); }
    /** A shared URL cannot prove that differently named options are the same product. */
    public static boolean ambiguousProductUrlMatch(ProductData prior,ProductData incoming) {
        if(normalize(prior.name()).equals(normalize(incoming.name()))) return false;
        Identity a=known(prior.identity(),prior.sourceEntryId(),prior.sources()),b=known(incoming.identity(),incoming.sourceEntryId(),incoming.sources());
        if(a!=null&&b!=null&&a.entryId()!=null&&b.entryId()!=null&&a.sourceSystem().equals(b.sourceSystem())&&a.entryId().equals(b.entryId())) return false;
        Set<String> urls=new HashSet<>();
        if(prior.productUrl()!=null)urls.add(canonical(prior.productUrl()));
        if(prior.identity()!=null&&prior.identity().detailUrl()!=null)urls.add(canonical(prior.identity().detailUrl()));
        return incoming.productUrl()!=null&&urls.contains(canonical(incoming.productUrl()))
            || incoming.identity()!=null&&incoming.identity().detailUrl()!=null&&urls.contains(canonical(incoming.identity().detailUrl()));
    }
    public static Identity known(Identity explicit,String legacy,List<Source> sources) {
        if(explicit!=null) return explicit;
        if(legacy==null||legacy.isBlank()) return null;
        var origins=sources.stream().filter(v->!"INACCESSIBLE".equals(v.access())&&Set.of("OFFICIAL","VENUE","ORGANIZER_SOCIAL").contains(v.kind())).map(v->system(v.url())).distinct().toList();
        if(origins.isEmpty()) origins=sources.stream().map(v->system(v.url())).distinct().toList();
        return origins.size()==1?new Identity(origins.getFirst(),legacy,null):null;
    }
    public static boolean conflicts(Identity a,Identity b) {
        return a!=null&&b!=null&&a.sourceSystem().equals(b.sourceSystem())&&a.entryId()!=null&&b.entryId()!=null&&!a.entryId().equals(b.entryId());
    }
    public static Set<String> union(Collection<String> a,Collection<String> b) {var values=new TreeSet<>(a);values.addAll(b);return values;}
    public static boolean intersects(Collection<String> a,Collection<String> b) {return !Collections.disjoint(a,b);}
}
