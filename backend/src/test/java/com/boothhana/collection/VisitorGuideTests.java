package com.boothhana.collection;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CatalogModels.*;

class VisitorGuideTests {
 private final List<Occurrence> dates=List.of(new Occurrence("2026-10-10","2026-10-11",null,null));
 private TicketInfo ticket(String status,String price,String source){return new TicketInfo("general","일반권","2026-10-10",price,"KRW","2026-08-10T19:00:00+09:00","2026-10-10T16:30:00+09:00",null,null,status,null,source,"2026-10-02");}
 private VisitorGuide guide(TicketInfo t){return new VisitorGuide(List.of(t),List.of(),List.of(),List.of(),List.of());}
 @Test void soldOutProgramNeedsSourceAndCheckDate(){
  var p=new ProgramInfo("stage","공연","STAGE",List.of(),null,null,null,null,"UNKNOWN",null,"SOLD_OUT",null,null,null);
  assertThatThrownBy(()->VisitorGuideRules.validate(new VisitorGuide(List.of(),List.of(p),List.of(),List.of(),List.of()),dates)).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void pricesNeedEditionScopedEvidenceAndUnknownPolicyCannotBecomeAnAnswer(){
  assertThatCode(()->VisitorGuideRules.validate(guide(ticket("PUBLISHED","8000","https://illustar.net/tickets")),dates)).doesNotThrowAnyException();
  assertThatThrownBy(()->VisitorGuideRules.validate(guide(ticket("PUBLISHED","8000",null)),dates)).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->VisitorGuideRules.validate(guide(ticket("UNKNOWN","8000",null)),dates)).isInstanceOf(IllegalArgumentException.class);
  var f=new FaqInfo("entry","오전 입장권으로 늦게 입장할 수 있나요?","작년에는 가능했습니다.","UNKNOWN",null,null);
  assertThatThrownBy(()->VisitorGuideRules.validate(new VisitorGuide(List.of(),List.of(),List.of(f),List.of(),List.of()),dates)).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void datesAndSeparatePerformanceTicketsCannotPointOutsideTheirEvent(){
  var p=new ProgramInfo("stage","보컬로이드 공연","STAGE",List.of("보컬로이드"),"2026-10-10","17:00","20:00",null,"SEPARATE","missing","PUBLISHED",null,"https://example.com/stage","2026-10-02");
  assertThatThrownBy(()->VisitorGuideRules.validate(new VisitorGuide(List.of(),List.of(p),List.of(),List.of(),List.of()),dates)).isInstanceOf(IllegalArgumentException.class);
  var s=new SaleAnnouncement("sale","공식 상품","온라인","2026-10-14",null,null,null,"https://example.com/sale","2026-10-02");
  assertThatCode(()->VisitorGuideRules.validate(new VisitorGuide(List.of(),List.of(),List.of(),List.of(s),List.of()),dates)).doesNotThrowAnyException();
 }
 @Test void eventDurationDoesNotCountAsBoothAttendanceButDeclaredSundayDoes(){
  var source=List.of(new Source("https://comicw.net/g/2938","OFFICIAL","ORIGINAL","일요일 참가 공지"));
  var uncertain=new Participant("2938","일요일 부스","CIRCLE",List.of(),List.of(new Location(null,"UNKNOWN",null,null,"2026-10-10","2026-10-11",null,"EVENT_PERIOD")),List.of(),null,List.of(),source,List.of(),List.of());
  assertThatThrownBy(()->CatalogRules.participant(uncertain)).isInstanceOf(IllegalArgumentException.class);
  var sunday=new Participant("2938","일요일 부스","CIRCLE",List.of(),List.of(new Location(null,"UNKNOWN",null,null,"2026-10-11","2026-10-11",null,"DECLARED")),List.of(),null,List.of(),source,List.of(),List.of());
  assertThatCode(()->CatalogRules.participant(sunday)).doesNotThrowAnyException();
 }
 @Test void oldSnapshotsRemainReadableAndReviewedGuideSurvivesProjection(){
  var old=new EventData("행사","COMIC_DOUJIN",null,null,"SEOUL",null,null,null,null,List.of(),dates,List.of(),List.of(),List.of());
  var json=JsonMapper.builder().build();
  var restored=json.readValue(json.writeValueAsString(old),EventData.class);
  assertThat(restored.visitorGuide()).isNull();
  var current=new EventData(old.name(),old.subcategory(),null,null,old.region(),null,null,null,null,List.of(),dates,List.of(),List.of(),List.of(),"MULTI_BOOTH",List.of(),null,guide(ticket("PUBLISHED","8000","https://example.com/tickets")));
  assertThat(PublicEventProjection.fromReviewed(current).visitorGuide()).isEqualTo(current.visitorGuide());
 }
}
