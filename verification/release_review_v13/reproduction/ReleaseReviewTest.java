package com.boothhana.support;
import java.util.*;
import com.boothhana.api.ApiException;
import com.boothhana.collection.CatalogPublicationService;
import com.boothhana.floorplan.FloorplanService;
import com.boothhana.service.PlatformService;
import tools.jackson.databind.json.JsonMapper;
import static com.boothhana.support.SupportModels.*;
import static com.boothhana.support.ServiceTest.values;
/** Executes unmodified v13 methods. Database/JSON/external public services are explicit test doubles. */
public class ReleaseReviewTest {
 static Map<String,Object> snapshot(String lastSeen) {
   var product=values("id",31L,"data",values("name","[TEST] 키링","summary","동일한 상품 설명", "price",values("amount","3000","currency","KRW"),"saleState","ON_SALE"),
     "verification",values("state","CONFIRMED_CURRENT","lastSeenAt",lastSeen));
   var participant=values("id",21L,"participant",values("registrationName","[TEST] 동일 부스","locations",List.of(values("code","B1","hall","1관","startDate","2026-10-10","endDate","2026-10-10"))),
    "sales",values("summary","동일한 상품 판매 안내"),"productRows",List.of(product));
   return values("event",values("name","[TEST] 동일 행사"),"publishedAt","2026-09-17T00:00:00Z","participants",List.of(participant),"assets",List.of());
 }
 static void exercise(String kind,String category) {
   var db=new ServiceTest.FakeDb();var json=new JsonMapper();var pub=new CatalogPublicationService();
   pub.data=snapshot("2026-09-17T00:00:00Z");
   var targets=new SupportTargets(pub,new FloorplanService(),new PlatformService(),db,json);
   var support=new SupportService(db,json,targets,new SupportRateLimiter(db),false,"");
   var owner=new Principal(1L,false,false);var admin=new Principal(9L,true,false);UUID id=UUID.randomUUID();
   var target=new Target("CATALOG",kind,10L,kind.equals("PRODUCT")?31L:21L,null,null,null,null);
   var before=support.create(new Create(id,"REPORT",category,"[TEST] 정보 오류 신고","가격 또는 위치가 틀렸습니다",List.of(),target,Map.of(),null),owner);
   var unchanged=targets.current(target,null);
   try { support.action(id,new Action(0,"VERIFY_CHANGED","테스트 정정",null,unchanged.fingerprint()),admin); throw new AssertionError("Control should reject unchanged"); }
   catch(ApiException e){ if(e.status.value()!=409)throw e; System.out.println("CONTROL "+kind+": unchanged content -> 409 (correct)"); }
   pub.data=snapshot("2026-09-24T00:00:00Z"); // sole changed field: verification.lastSeenAt
   var after=targets.current(target,null);
   if(Objects.equals(before.get("receivedFingerprint"),after.fingerprint()))throw new AssertionError("Expected reviewed v13 defect no longer present");
   var done=support.action(id,new Action(0,"VERIFY_CHANGED","실제 상품/부스는 수정하지 않은 테스트",null,after.fingerprint()),admin);
   if(!"RESOLVED".equals(done.get("status"))||!"UPDATED".equals(done.get("resolution")))throw new AssertionError("Expected flawed completion");
   System.out.println("REPRODUCED "+kind+": only verification.lastSeenAt changed; original product/booth unchanged -> "+done.get("status")+" / "+done.get("resolution"));
 }
 public static void main(String[]args){exercise("PRODUCT","PRODUCT_PRICE");exercise("PARTICIPANT","PARTICIPATION_LOCATION");System.out.println("Evidence only: actual SupportTargets/SupportService, scripted JDBC/JSON. NOT real SQL/transactions/HTTP.");}
}
