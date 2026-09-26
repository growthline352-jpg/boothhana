package com.boothhana.collection;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.*;
import static com.boothhana.collection.CollectionRules.*;
import static com.boothhana.collection.CatalogModels.*;

/** Deterministic validation only: an AI source label is never treated as a verified licence. */
public final class CatalogRules {
    private CatalogRules() {}
    public static final Set<String> SCOPES = Set.of("EVENT_LISTED","EVENT_SALE_CONFIRMED","PROFILE","GENERAL_CATALOG","PAST_REFERENCE","UNKNOWN");
    public static void strings(List<String> list,int count,int length) {
        items(list,count); for(String item:list) { text(item,length,false); }
    }
    public static void items(List<?> list,int max) { require(list!=null&&list.size()<=max&&list.stream().noneMatch(Objects::isNull),"목록 누락/크기 오류"); }
    private static void choice(String v,String... options) { require(v!=null&&Set.of(options).contains(v),"분류/상태 값 오류"); }
    private static void nonempty(String v,int max) { text(v,max,false);require(!v.isBlank(),"필수 문자열 없음"); }
    public static void sources(List<CollectionModels.Source> sources) {
        items(sources,10);require(!sources.isEmpty(),"출처 없음");boolean usable=false;
        for(var s:sources) {
            url(s.url());choice(s.kind(),"OFFICIAL","ORGANIZER_SOCIAL","VENUE","AGGREGATOR","OTHER");
            choice(s.access(),"ORIGINAL","SEARCH_SNIPPET","INACCESSIBLE");text(s.evidence(),240,false);
            usable|=!"INACCESSIBLE".equals(s.access())&&!s.evidence().isBlank();
        }
        require(usable,"확인 가능한 근거 없음");
    }
    public static void images(List<Image> images) {
        items(images,10);
        for(Image i:images) {
            choice(i.type(),"BANNER","FLOOR_PLAN","BOOTH_CUT","SALES_SHEET","PRODUCT","LOGO");
            url(i.imageUrl());url(i.pageUrl());text(i.rightsEvidence(),1000,true);text(i.caption(),300,true);
        }
    }
    public static void participant(Participant p) {
        require(p!=null,"참가 부스 없음");text(p.sourceEntryId(),300,true);nonempty(p.registrationName(),255);
        choice(p.kind(),"CIRCLE","BRAND","ARTIST","SHOP","JOINT","HOST","CAFE","UNKNOWN");
        items(p.members(),30);
        for(Member m:p.members()) { nonempty(m.name(),255);choice(m.kind(),"CIRCLE","BRAND","ARTIST","SHOP","HOST","CAFE","UNKNOWN");strings(m.aliases(),20,255);if(m.profileUrl()!=null) url(m.profileUrl()); }
        items(p.locations(),30);
        for(Location l:p.locations()) {
            choice(l.status(),"ASSIGNED","UNASSIGNED","UNKNOWN","NOT_APPLICABLE");text(l.code(),64,true);
            require(!"ASSIGNED".equals(l.status())||(l.code()!=null&&!l.code().isBlank()),"배정 확인된 부스번호 없음");
            require("ASSIGNED".equals(l.status())||l.code()==null,"미배정/미확인 번호를 추정할 수 없습니다.");
            text(l.hall(),150,true);text(l.zone(),150,true);
            require((l.startDate()==null)==(l.endDate()==null),"위치 적용 날짜는 시작/종료를 함께 지정하세요.");
            if(l.startDate()!=null) require(!date(l.startDate()).isAfter(date(l.endDate())),"위치 날짜 역전");
            if(l.floorPlanUrl()!=null) url(l.floorPlanUrl());
        }
        strings(p.subjects(),30,150);strings(p.officialLinks(),20,2048);p.officialLinks().forEach(CollectionRules::url);
        sources(p.sources());images(p.images());strings(p.warnings(),30,500);
        CatalogIdentity.validate(p.identity(),p.sourceEntryId(),p.sources());
    }
    public static void sales(Sales s) { sales(s,100); }
    public static void salesSnapshot(Sales s) { sales(s,5000); }
    private static void sales(Sales s,int maxProducts) {
        require(s!=null,"판매정보 없음");nonempty(s.summary(),500);require(SCOPES.contains(s.evidenceScope()),"판매 근거 범위 오류");
        strings(s.categories(),30,100);strings(s.subjects(),30,150);text(s.salesMethod(),1000,true);
        sources(s.sources());images(s.images());strings(s.warnings(),30,500);items(s.products(),maxProducts);
        for(ProductData p:s.products()) product(p);
    }
    public static void product(ProductData p) {
        nonempty(p.name(),255);text(p.sourceEntryId(),300,true);text(p.summary(),1000,false);text(p.memberName(),255,true);
        strings(p.categories(),20,100);strings(p.subjects(),30,150);require(SCOPES.contains(p.evidenceScope()),"상품 행사 연관 상태 오류");
        choice(p.saleState(),"PLANNED","ON_SALE","SOLD_OUT","CANCELED","UNKNOWN");
        if(p.price()!=null) {
            Price price=p.price();require(price.amount()!=null&&price.amount().matches("[0-9]{1,12}(\\.[0-9]{1,2})?"),"가격 형식 오류");
            require(new BigDecimal(price.amount()).signum()>=0,"가격 음수");require(price.currency()!=null&&price.currency().matches("[A-Z]{3}"),"통화 오류");date(price.checkedOn());text(price.note(),500,true);
        }
        if(p.productUrl()!=null) url(p.productUrl());sources(p.sources());images(p.images());strings(p.warnings(),30,500);
        CatalogIdentity.validate(p.identity(),p.sourceEntryId(),p.sources());
    }
    public static void coverage(Coverage c) {
        require(c!=null,"수집 범위 없음");choice(c.completeness(),"COMPLETE","PARTIAL","UNPUBLISHED","NOT_APPLICABLE","UNKNOWN");
        require(c.reportedTotal()==null||(c.reportedTotal()>=0&&c.reportedTotal()<=1000000),"출처 표기 총수 오류");
        choice(c.totalUnit(),"REGISTERED_BOOTHS","BOOTH_CUTS","PRODUCTS","UNKNOWN");
        strings(c.visitedPages(),100,2048);c.visitedPages().forEach(CollectionRules::url);if(c.nextPageUrl()!=null) url(c.nextPageUrl());
        require(!"COMPLETE".equals(c.completeness())||c.nextPageUrl()==null,"다음 페이지가 남은 명단은 전체 완료가 아닙니다.");
        strings(c.warnings(),30,500);
    }
    public static void stage(StageBatch b) { stage(b,false); }
    /** Review-only import for research packages collected outside the CLI pipeline.
     * The request must keep the audit flag false; manual data is never relabelled as CLI-observed. */
    public static void manualStage(StageBatch b) { stage(b,true); }
    private static void stage(StageBatch b,boolean manualImport) {
        require(b!=null&&Set.of("4","5").contains(b.schemaVersion()),"v4/v5 수집 규격 필요");require(UUID.fromString(b.runId()).toString().equals(b.runId())&&UUID.fromString(b.pipelineId()).toString().equals(b.pipelineId()),"정규 UUID 필요");
        choice(b.stage(),"PARTICIPANTS","SALES");require(b.eventId()>0&&b.targetRevision()>0,"대상 ID/버전 오류");
        require("SALES".equals(b.stage())?(b.participantId()!=null&&b.participantId()>0):b.participantId()==null,"단계별 부모 ID 오류");
        Instant start=Instant.parse(b.startedAt()),end=Instant.parse(b.finishedAt());require(!end.isBefore(start)&&end.minusSeconds(86400).isBefore(start),"작업 시간 범위 오류");
        if(b.cursor()!=null) {
            CursorRef c=b.cursor();require("PARTICIPANTS".equals(b.stage()),"명단 단계만 커서를 사용합니다.");
            require(c.sourceKey()!=null&&c.sourceKey().matches("[a-f0-9]{64}")&&c.passNo()>0&&c.pageIndex()>=0&&c.revision()>0,"커서 범위 오류");
            if(c.requestedUrl()!=null) url(c.requestedUrl());
        }
        if("5".equals(b.schemaVersion())&&"PARTICIPANTS".equals(b.stage())) require(b.cursor()!=null,"v5 명단 진행 커서 필요");
        StageResult r=b.result();require(r!=null,"결과 없음");choice(r.searchStatus(),"COMPLETE","PARTIAL","FAILED");text(r.summary(),2000,false);strings(r.queries(),50,300);coverage(r.coverage());items(r.participants(),100);
        if(!"FAILED".equals(r.searchStatus())) {
            require(!r.queries().isEmpty(),"검색 기록 필요");
            if(manualImport) require(!b.webSearchObserved(),"수동 수입은 CLI 검색 관측으로 표시할 수 없습니다.");
            else require(b.webSearchObserved(),"실제 CLI 웹 검색 기록 필요");
        }
        if("FAILED".equals(r.searchStatus())) require(r.participants().isEmpty()&&r.sales()==null,"실패를 정상 데이터로 저장할 수 없습니다.");
        require("PARTICIPANTS".equals(b.stage())?r.sales()==null:r.participants().isEmpty(),"단계 데이터 혼합 금지");
    }
    public static String participantKey(Participant p) { return CatalogIdentity.participantKeys(p).getFirst(); }
    public static String productKey(ProductData p) { return CatalogIdentity.productKeys(p).getFirst(); }
    public static void locationDates(Participant p,CollectionModels.EventData e) {
        for(Location l:p.locations()) if(l.startDate()!=null) {
            require(e.occurrences().stream().anyMatch(o->!date(l.startDate()).isBefore(date(o.startDate()))&&!date(l.endDate()).isAfter(date(o.endDate()))),"행사 운영일 밖의 부스 위치 날짜");
        }
    }
    public static void edit(EditInput i,Set<String> allowed) {
        require(i!=null&&i.revision()>0,"편집 버전 필요");choice(i.reviewState(),"PENDING","REVIEWED","EXCLUDED");text(i.note(),2000,false);
        require(i.overrides()!=null&&allowed.containsAll(i.overrides().keySet()),"변경할 수 없는 필드 포함");
        require(i.clearOverrides()!=null&&allowed.containsAll(i.clearOverrides())&&i.clearOverrides().size()<=allowed.size(),"해제할 수 없는 필드 포함");
        require(Collections.disjoint(i.overrides().keySet(),i.clearOverrides()),"같은 필드를 변경과 해제로 동시에 지정할 수 없습니다.");
    }
}
