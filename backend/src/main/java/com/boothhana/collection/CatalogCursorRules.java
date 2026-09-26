package com.boothhana.collection;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;

public final class CatalogCursorRules {
    private CatalogCursorRules() {}
    public record Advance(String state,String nextPageUrl,int pageIndex,List<String> visited,String warning) {}
    public static Advance advance(CursorRef ref,Coverage coverage,List<String> visited,boolean failed) {
        if(failed) return new Advance("BLOCKED",ref.requestedUrl(),ref.pageIndex(),visited,"명단 조사 실패: 동일 페이지 재시도");
        String current=ref.requestedUrl()==null?"AUTO":CatalogIdentity.canonical(ref.requestedUrl());
        String next=coverage.nextPageUrl()==null?null:CatalogIdentity.canonical(coverage.nextPageUrl());
        var seen=new LinkedHashSet<>(visited);seen.add(current);
        if(next!=null&&(seen.contains(next)||seen.size()>10000))
            return new Advance("BLOCKED",ref.requestedUrl(),ref.pageIndex(),visited,"반복/과도한 페이지: 커서 검토 필요");
        if(next!=null) return new Advance("ACTIVE",coverage.nextPageUrl(),ref.pageIndex()+1,List.copyOf(seen),null);
        if(Set.of("COMPLETE","NOT_APPLICABLE","UNPUBLISHED").contains(coverage.completeness()))
            return new Advance("COMPLETE",null,ref.pageIndex()+1,List.copyOf(seen),null);
        return new Advance("BLOCKED",ref.requestedUrl(),ref.pageIndex(),visited,"원문 일부만 확인: 같은 페이지를 다시 확인해야 합니다.");
    }
}
