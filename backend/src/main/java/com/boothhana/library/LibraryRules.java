package com.boothhana.library;

import java.net.URI;
import java.text.Normalizer;
import java.time.*;
import java.util.*;
import static com.boothhana.library.LibraryModels.*;

public final class LibraryRules {
    public static final int MAX_ITEMS=500;
    private LibraryRules() {}
    public static Target target(Target t) {
        if(t==null||t.eventId()<1||t.id()<1||t.eventId()>9007199254740991L||t.id()>9007199254740991L||
            !Set.of("EVENT","PARTICIPANT","PRODUCT").contains(t.type()==null?"":t.type())) throw new IllegalArgumentException("저장 대상을 확인해 주세요.");
        if("EVENT".equals(t.type())) {
            if(t.id()!=t.eventId()||t.participantId()!=null)throw new IllegalArgumentException("행사 저장 대상이 일치하지 않습니다.");
            return new Target(t.type(),t.eventId(),t.id(),null);
        }
        long participant="PARTICIPANT".equals(t.type())?t.id():t.participantId()==null?0:t.participantId();
        if(participant<1||participant>9007199254740991L||("PARTICIPANT".equals(t.type())&&t.participantId()!=null&&t.participantId()!=t.id()))
            throw new IllegalArgumentException("상품과 참가 부스의 연결을 확인해 주세요.");
        return new Target(t.type(),t.eventId(),t.id(),participant);
    }
    public static String note(String s){return text(s,1000,"메모는 1,000자 이내로 적어 주세요.");}
    public static String hall(String s){return text(s,150,"전시관 이름이 너무 깁니다.");}
    public static String text(String s,int max,String message){String v=s==null?"":s.strip();if(v.length()>max||v.indexOf('\0')>=0)throw new IllegalArgumentException(message);return v;}
    public static String day(String s){if(s==null||s.isBlank())return "";if(!s.matches("\\d{4}-\\d{2}-\\d{2}"))throw new IllegalArgumentException("날짜 형식을 확인해 주세요.");try{return LocalDate.parse(s).toString();}catch(DateTimeException e){throw new IllegalArgumentException("존재하는 날짜를 선택해 주세요.");}}
    public static String visitDay(String s,LocalDate today){String d=day(s);if(d.isEmpty()||LocalDate.parse(d).isAfter(today))throw new IllegalArgumentException("방문 표시는 오늘 또는 지난 날짜에만 남길 수 있어요.");return d;}
    public static boolean operatingDay(Current c,String d){if(d==null||d.isBlank())return true;return c.occurrences().stream().anyMatch(o->d.compareTo(str(o.get("startDate")))>=0&&d.compareTo(str(o.get("endDate")))<=0);}
    public static String normalize(String s){return Normalizer.normalize(s==null?"":s,Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("\\s+"," ").strip();}
    public static boolean matches(String query,Entry e){String own=e.note()+" "+e.savedAt()+" "+e.day()+" "+e.hall()+" "+String.join(" ",e.visitedDays());
        // Revoked public content must not remain searchable through remembered titles/tags.
        if(e.available())own+=" "+search(e.saved())+" "+search(e.current().memory())+" "+e.current().venue();
        String hay=normalize(own);return Arrays.stream(normalize(query).split(" ")).allMatch(hay::contains);
    }
    private static String search(Memory m){return m==null?"":m.title()+" "+m.eventName()+" "+m.participantName()+" "+m.summary()+" "+String.join(" ",m.tags());}
    public static String url(String value){try{URI u=URI.create(value);String p=u.getScheme();return ("https".equalsIgnoreCase(p)||"http".equalsIgnoreCase(p))&&u.getHost()!=null&&u.getUserInfo()==null?u.toASCIIString():null;}catch(Exception e){return null;}}
    public static String str(Object value){return value==null?"":value.toString();}
    public static long participant(Target t){return t.participantId()==null?0:t.participantId();}
}
