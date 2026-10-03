package com.boothhana.collection;

import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.util.*;
import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CollectionRules.*;

/** Public, edition-specific visitor facts. Unknown policy is never a confirmed answer. */
public final class VisitorGuideRules {
    private VisitorGuideRules() {}
    private static void items(List<?> values,int max) {
        require(values!=null && values.size()<=max && values.stream().noneMatch(Objects::isNull),"관람 안내 항목 수 오류");
    }
    private static void id(String value,Set<String> ids) {
        require(value!=null && value.matches("[a-zA-Z0-9_-]{1,80}") && ids.add(value),"관람 안내 ID 중복/형식 오류");
    }
    private static void provenance(String source,String checked,boolean confirmed) {
        if(source!=null) url(source); if(checked!=null) date(checked);
        require(!confirmed || source!=null && checked!=null,"확정 안내에는 출처와 확인일이 필요합니다.");
    }
    private static void timestamp(String value) { if(value!=null) {if(value.matches("\\d{4}-\\d{2}-\\d{2}"))date(value);else OffsetDateTime.parse(value);} }
    private static LocalDate calendarDate(String value) {return value.length()==10?LocalDate.parse(value):OffsetDateTime.parse(value).atZoneSameInstant(java.time.ZoneId.of("Asia/Seoul")).toLocalDate();}
    private static void period(String a,String b) {
        timestamp(a);timestamp(b);
        require(a==null || b==null || (a.length()==10||b.length()==10?!calendarDate(b).isBefore(calendarDate(a)):!OffsetDateTime.parse(b).isBefore(OffsetDateTime.parse(a))),"판매 기간 역전");
    }
    private static void time(String value) { require(value==null || value.matches("(?:[01]\\d|2[0-3]):[0-5]\\d"),"관람 안내 시간 오류"); }
    private static void day(String value,List<Occurrence> dates) {
        if(value==null) return;date(value);
        require(dates.stream().anyMatch(o->o.startDate().compareTo(value)<=0 && o.endDate().compareTo(value)>=0),"행사 기간 밖 관람 일정");
    }
    private static void status(String value) { require(value!=null&&Set.of("PUBLISHED","UNPUBLISHED","UNKNOWN","SOLD_OUT").contains(value),"관람 안내 상태 오류"); }
    public static void validate(VisitorGuide guide,List<Occurrence> dates) {
        if(guide==null) return;
        items(guide.tickets(),40);items(guide.programs(),100);items(guide.faq(),30);items(guide.sales(),30);items(guide.coverage(),8);
        Set<String> ticketIds=new HashSet<>();
        for(var t:guide.tickets()) {
            id(t.id(),ticketIds);text(t.name(),150,false);require(!t.name().isBlank(),"예매권 이름 없음");day(t.visitDate(),dates);
            require(t.bookingState()==null || Set.of("UNKNOWN","UPCOMING","OPEN","CLOSED","SOLD_OUT").contains(t.bookingState()),"예매 상태 오류");
            require(t.bookingState()==null || "UNKNOWN".equals(t.bookingState()) || Set.of("PUBLISHED","SOLD_OUT").contains(t.status()),"예매 상태 확정에는 공개 자료 확인이 필요합니다.");
            status(t.status());provenance(t.sourceUrl(),t.checkedOn(),!Set.of("UNKNOWN","UNPUBLISHED").contains(t.status()));
            require(t.priceAmount()==null || t.priceAmount().matches("\\d{1,12}(?:\\.\\d{1,2})?"),"예매권 가격 오류");
            require(t.priceAmount()==null || t.currency()!=null && t.currency().matches("[A-Z]{3}"),"예매권 통화 오류");
            period(t.salesStartsAt(),t.salesEndsAt());time(t.entryTime());text(t.note(),700,true);
            if(t.reservationUrl()!=null) url(t.reservationUrl());
            require(!Set.of("UNKNOWN","UNPUBLISHED").contains(t.status()) || t.priceAmount()==null && t.entryTime()==null && t.reservationUrl()==null,"미확정 예매권에 확정 가격/입장/구매 링크를 넣을 수 없습니다.");
        }
        Set<String> ids=new HashSet<>();
        for(var p:guide.programs()) {
            id(p.id(),ids);text(p.name(),150,false);require(!p.name().isBlank(),"프로그램 이름 없음");day(p.day(),dates);
            require(Set.of("STAGE","DANCE","MEETUP","WORKSHOP","EXHIBITION","OTHER").contains(p.type()),"프로그램 유형 오류");
            items(p.subjects(),20);p.subjects().forEach(s->text(s,100,false));time(p.startTime());time(p.endTime());
            require(p.startTime()==null || p.endTime()==null || p.startTime().compareTo(p.endTime())<0,"프로그램 시간 역전");
            text(p.venue(),200,true);text(p.note(),700,true);status(p.status());
            require(p.day()!=null || p.startTime()==null && p.endTime()==null,"프로그램 시각에는 날짜가 필요합니다.");
            require(Set.of("INCLUDED","SEPARATE","UNKNOWN").contains(p.ticketRequirement()),"프로그램 입장 조건 오류");
            require(p.ticketId()==null || ticketIds.contains(p.ticketId()),"연결된 프로그램 예매권 없음");
            provenance(p.sourceUrl(),p.checkedOn(),Set.of("PUBLISHED","SOLD_OUT").contains(p.status()));
        }
        ids.clear();
        for(var f:guide.faq()) {
            id(f.id(),ids);text(f.question(),240,false);text(f.answer(),1000,true);
            require(Set.of("CONFIRMED","UNKNOWN").contains(f.status()),"FAQ 상태 오류");
            require("UNKNOWN".equals(f.status())?f.answer()==null:f.answer()!=null && !f.answer().isBlank(),"미확인 FAQ는 답변을 확정할 수 없습니다.");
            provenance(f.sourceUrl(),f.checkedOn(),"CONFIRMED".equals(f.status()));
        }
        ids.clear();
        for(var s:guide.sales()) {
            id(s.id(),ids);text(s.title(),200,false);text(s.salesMethod(),300,true);text(s.note(),700,true);
            period(s.salesStartsAt(),s.salesEndsAt());day(s.pickupDay(),dates);provenance(s.sourceUrl(),s.checkedOn(),true);
        }
        ids.clear();
        for(var c:guide.coverage()) {
            require(Set.of("PARTICIPANTS","SALES","PROGRAMS","TICKETS","FAQ").contains(c.kind()) && ids.add(c.kind()),"수집 상태 유형 중복/오류");
            require(Set.of("PUBLISHED","PARTIAL","UNPUBLISHED","UNKNOWN","INACCESSIBLE").contains(c.status()),"수집 상태 오류");
            text(c.note(),500,true);provenance(c.sourceUrl(),c.checkedOn(),!"UNKNOWN".equals(c.status()));
        }
    }
}
