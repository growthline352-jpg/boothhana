package com.boothhana.collection;

import static com.boothhana.collection.CollectionModels.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Pure rules. Source-access labels are reported by the CLI, not independent fact verification. */
public final class CollectionRules {
    private CollectionRules() {}
    public static final Set<String> CATEGORIES = CatalogTaxonomy.TYPES;
    public record Check(List<String> errors, List<String> warnings) { public boolean accepted() { return errors.isEmpty(); } }

    public static void batch(Batch value) {
        require(value != null && "1".equals(value.schemaVersion()), "지원하지 않는 배치 버전입니다.");
        require(UUID.fromString(value.runId()).toString().equals(value.runId()), "runId는 표준 소문자 UUID여야 합니다.");
        Instant start = Instant.parse(value.startedAt()), end = Instant.parse(value.finishedAt());
        require(!end.isBefore(start) && ChronoUnit.SECONDS.between(start, end) <= 86400, "실행 시간 범위가 잘못되었습니다.");
        require(Set.of("CLI", "MANUAL_IMPORT").contains(value.executionMode()), "실행 방식 오류");
        Scope scope = value.scope();
        require(scope != null && CatalogTaxonomy.SCOPES.contains(scope.region()) && "Asia/Seoul".equals(scope.timezone()), "서울·경기만 수집합니다. 인천은 제외합니다.");
        LocalDate a = date(scope.startDate()), b = date(scope.endDate());
        require(!a.isAfter(b) && ChronoUnit.DAYS.between(a, b) <= 365, "검색 기간은 최대 366일입니다.");
        SearchResult result = value.result();
        require(result != null && "1".equals(result.schemaVersion()), "검색 결과 버전 오류");
        require(result.searchStatus()!=null && Set.of("COMPLETE", "PARTIAL", "FAILED").contains(result.searchStatus()), "검색 상태 오류");
        text(result.summary(), 2000, false);
        list(result.queries(), 50); result.queries().forEach(query -> text(query, 300, false));
        list(result.sourceCoverage(),6);
        for(SourceCoverage coverage:result.sourceCoverage()) {
            require(Set.of("VENUE_CALENDAR","ORGANIZER_OFFICIAL","PUBLIC_AGENCY","TICKETING","PARTICIPANT_SOCIAL","COMMUNITY_INDEX").contains(coverage.channel()),"출처군 오류");
            require(Set.of("CHECKED","NO_RESULTS","PARTIAL","INACCESSIBLE").contains(coverage.status()),"출처군 상태 오류");
            list(coverage.queries(),20);coverage.queries().forEach(query->text(query,300,false));
            list(coverage.checkedUrls(),50);coverage.checkedUrls().forEach(CollectionRules::url);
            text(coverage.notes(),500,false);
        }
        list(result.events(), 200);
        if (!"FAILED".equals(result.searchStatus())) {
            require(!result.queries().isEmpty(), "실행한 검색어가 없습니다.");
            require(!"CLI".equals(value.executionMode()) || value.webSearchObserved(), "완료된 CLI 웹 검색 기록이 없습니다.");
        } else require(result.events().isEmpty(), "실패한 검색은 행사를 저장할 수 없습니다.");
    }

    public static Check event(EventData e, Scope scope) {
        List<String> errors = new ArrayList<>(), warnings = new ArrayList<>();
        if (e == null) return new Check(List.of("행사 객체 없음"), List.of());
        try {
            text(e.name(), 255, false); require(!e.name().isBlank(), "행사명 없음");
            require(e.subcategory()!=null && CATEGORIES.contains(e.subcategory()), "행사 분류 오류");
            text(e.organizer(), 255, true); text(e.edition(), 100, true); text(e.venueName(), 255, true);
            text(e.address(), 500, true); text(e.description(), 2000, false); text(e.admission(), 500, true);
            list(e.subjects(), 20); e.subjects().forEach(v -> text(v, 100, false));
            list(e.warnings(), 20); e.warnings().forEach(v -> text(v, 300, false)); warnings.addAll(e.warnings());
            require(e.region()!=null && CatalogTaxonomy.REGIONS.contains(e.region()), "서울·경기 개최 확인 안 됨");
            require("SEOUL_GYEONGGI".equals(scope.region()) || Objects.equals(scope.region(),e.region()), "배치 지역 범위 밖 행사");
            String address = e.address()==null ? "" : e.address().strip();
            require(CatalogTaxonomy.addressMatches(e.region(),address), "지역 코드와 실제 개최 주소 불일치");
            String place = normalize(e.venueName());
            require(CatalogTaxonomy.placeMatches(e.region(),place), "대상 지역 밖 전시장 또는 지역 코드 불일치");
            if (place.isEmpty() || place.contains("비공개")) warnings.add("장소 미확정/비공개");
            if (address.isEmpty()) warnings.add("상세 주소 확인 필요");
            list(e.occurrences(), 100); require(!e.occurrences().isEmpty(), "확인된 개최일 없음");
            List<Occurrence> sorted = e.occurrences().stream().sorted(Comparator.comparing(Occurrence::startDate)).toList();
            LocalDate previousEnd = null;
            boolean overlaps = false;
            for (Occurrence o : sorted) {
                LocalDate a = date(o.startDate()), b = date(o.endDate());
                require(!a.isAfter(b) && ChronoUnit.DAYS.between(a,b)<=366, "잘못된 운영 날짜");
                require(previousEnd==null || a.isAfter(previousEnd), "중복/겹치는 운영일 구간"); previousEnd=b;
                time(o.startTime()); time(o.endTime());
                if (a.equals(b) && o.startTime()!=null && o.endTime()!=null)
                    require(o.startTime().compareTo(o.endTime())<0, "시간 역전");
                if(o.startTime()==null || o.endTime()==null) warnings.add("운영시간 확인 필요");
                if(!a.isAfter(date(scope.endDate())) && !b.isBefore(date(scope.startDate()))) overlaps=true;
            }
            require(overlaps, "검색 기간과 겹치지 않음");
            list(e.sources(), 5); require(!e.sources().isEmpty(), "원문 출처 없음");
            boolean evidence=false, original=false;
            for(Source s:e.sources()) {
                url(s.url()); text(s.evidence(),240,false);
                require(s.kind()!=null && Set.of("OFFICIAL","ORGANIZER_SOCIAL","VENUE","AGGREGATOR","OTHER").contains(s.kind()), "출처 유형 오류");
                require(s.access()!=null && Set.of("ORIGINAL","SEARCH_SNIPPET","INACCESSIBLE").contains(s.access()), "출처 확인 수준 오류");
                if(!"INACCESSIBLE".equals(s.access()) && !s.evidence().isBlank()) evidence=true;
                if("ORIGINAL".equals(s.access())) original=true;
            }
            require(evidence, "확인 가능한 출처 근거 없음");
            if(!original) warnings.add("원문 직접 확인 필요(검색 요약만 확인)");
            require(Set.of("MULTI_BOOTH","SINGLE_HOST","UNKNOWN").contains(e.eventFormat()),"행사 형태 오류");
            list(e.discoveryLinks(),20);
            for (DiscoveryLink link : e.discoveryLinks()) {
                require(Set.of("PARTICIPANTS","FLOOR_PLAN","SALES","OFFICIAL").contains(link.kind()),"탐색 링크 유형 오류");
                require(Set.of("PUBLISHED","UNPUBLISHED","INACCESSIBLE","UNKNOWN").contains(link.status()),"링크 상태 오류");
                if(link.url()!=null) url(link.url()); text(link.note(),500,true);
            }
            operationStatus(e.operationStatus());
            VisitorGuideRules.validate(e.visitorGuide(), e.occurrences());
            list(e.banners(),3);
            for(Banner b:e.banners()) {
                url(b.imageUrl());url(b.pageUrl());text(b.rightsEvidence(),500,true);
                require(b.rights()!=null && Set.of("UNKNOWN","STATED_PERMISSION").contains(b.rights()), "이미지 사용조건 형식 오류");
            }
            warnings.add(e.banners().isEmpty()?"배너 없음":"배너 사용허락·해당 회차 확인 필요(자동 사용하지 않음)");
        } catch(RuntimeException ex) {
            errors.add(ex instanceof IllegalArgumentException && ex.getMessage()!=null ? ex.getMessage() : "행사 필드 누락/형식 오류");
        }
        return new Check(errors, warnings.stream().distinct().sorted().toList());
    }
    /** Status is source-backed, not inferred from dates or a warning's keywords. */
    public static void operationStatus(OperationStatus status) {
        require(status!=null && Set.of("UNKNOWN","SCHEDULED","CANCELED","POSTPONED","RESCHEDULED").contains(status.state()),"개최 상태 오류");
        text(status.note(),500,true);
        if(status.sourceUrl()!=null) url(status.sourceUrl());
        if(status.checkedOn()!=null) date(status.checkedOn());
        if(!"UNKNOWN".equals(status.state())) {
            require(status.sourceUrl()!=null && status.checkedOn()!=null && status.note()!=null && !status.note().isBlank(),"개최 상태에는 확인 원문·확인일·안내가 필요합니다.");
        }
    }
    public static String identity(EventData e) {
        String dates = e.occurrences().stream().map(o->o.startDate()+":"+o.endDate()).sorted().reduce((a,b)->a+","+b).orElse("");
        return sha(String.join("\u001f", normalize(e.name()), normalize(e.venueName()), normalize(e.organizer()), normalize(e.edition()), dates));
    }
    public static String matchKey(EventData e) {
        String year=e.occurrences().stream().map(Occurrence::startDate).min(String::compareTo).orElse("").substring(0,4);
        return sha(String.join("\u001f", normalize(e.name()), normalize(e.edition()), year));
    }
    public static String sha(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    public static String normalize(String value) {
        return Normalizer.normalize(value==null?"":value,Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("(?U)\\s+","");
    }
    public static LocalDate date(String value) {
        require(value!=null && value.matches("\\d{4}-\\d{2}-\\d{2}"),"날짜 형식은 YYYY-MM-DD여야 합니다.");
        LocalDate parsed=LocalDate.parse(value);
        require(parsed.getYear()>=1,"유효하지 않은 연도입니다.");
        return parsed;
    }
    private static void time(String value) { require(value==null || value.matches("(?:[01]\\d|2[0-3]):[0-5]\\d"),"시간 형식 오류"); }
    public static void url(String value) {
        text(value,2048,false);
        require(!value.matches(".*[\\x00-\\x20\\\\].*"),"안전하지 않은 URL 형식");
        URI uri=URI.create(value);String host=uri.getHost();
        require(("https".equals(uri.getScheme())||"http".equals(uri.getScheme())) && host!=null && uri.getUserInfo()==null,"공개 HTTP(S) URL이 필요합니다.");
        host=host.toLowerCase(Locale.ROOT).replaceAll("\\.$","");
        require(host.contains(".") && !host.matches("[0-9.]+") && !host.contains(":")
            && !host.endsWith(".local") && !host.endsWith(".internal") && !host.endsWith(".localhost")
            && !host.endsWith(".test") && !host.endsWith(".invalid"),"로컬/내부/IP URL을 저장할 수 없습니다.");
        require(uri.getPort()==-1||uri.getPort()==80||uri.getPort()==443,"표준 HTTP(S) 포트만 허용합니다.");
    }
    public static void text(String value, int max, boolean nullable) {
        require(value!=null?value.length()<=max:nullable,"필수값 누락 또는 문자열 길이 초과");
    }
    private static void list(List<?> values,int max) {
        require(values!=null && values.size()<=max && values.stream().noneMatch(Objects::isNull),"필수 목록 누락/항목 수 초과");
    }
    public static void require(boolean condition,String message) { if(!condition) throw new IllegalArgumentException(message); }
}
