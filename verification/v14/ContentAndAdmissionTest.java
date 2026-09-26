package com.boothhana.support;
import java.util.*;
import java.io.*;
import com.boothhana.api.ApiException;
import static com.boothhana.support.ServiceTest.*;
import static com.boothhana.support.SupportModels.*;
/** Actual production methods with scripted JDBC; NOT Spring/SQL/network integration. */
public class ContentAndAdmissionTest {
 static int count;
 static void ok(boolean b,String label){count++;if(!b)throw new AssertionError(label);}
 static final Principal USER=new Principal(1L,false,false),ADMIN=new Principal(9L,true,false);
 static Map<String,Object> product(String timestamp,String amount){return values("id",31L,"data",values("name","[TEST] 키링","price",values("amount",amount,"currency","KRW","checkedOn",timestamp,"note",null),"saleState","ON_SALE","evidenceScope","EVENT_SALE_CONFIRMED","sources",List.of(values("checkedAt",timestamp))),"verification",values("state","SEEN","lastSeenAt",timestamp));}
 static Map<String,Object> participant(String timestamp,String amount,String code){return values("id",21L,"participant",values("registrationName","[TEST] 서클","locations",List.of(values("code",code,"status","ASSIGNED","hall","1관","startDate","2026-10-10","endDate","2026-10-10","floorPlanUrl","https://example.test/map"))),"sales",values("summary","키링 판매","subjects",List.of("오리지널")),"productRows",List.of(product(timestamp,amount)));}
 static void publication(ReliabilityTest.Fixture f,String timestamp,String amount,String code){f.pub.data=values("event",values("name","[TEST] 행사"),"publishedAt",timestamp,"participants",List.of(participant(timestamp,amount,code)),"assets",List.of());}
 static UUID report(ReliabilityTest.Fixture f,Target target,String reason){UUID id=UUID.randomUUID();f.service.create(new Create(id,"REPORT",reason,"[TEST] 정보 오류","원문과 다릅니다.",List.of(),target,Map.of(),null),USER);return id;}
 static void reject(ReliabilityTest.Fixture f,UUID id,Target target){String fp=f.targets.current(target,1L).fingerprint();fails(409,()->f.service.action(id,new Action(0,"VERIFY_CHANGED","확인",null,fp),ADMIN));count++;}
 public static void main(String[] args)throws Exception {
  Target product=new Target("CATALOG","PRODUCT",10,31L,null,null,null,null), booth=new Target("CATALOG","PARTICIPANT",10,21L,null,null,null,null);
  var f=new ReliabilityTest.Fixture();publication(f,"2026-09-17","3000","B1");UUID id=report(f,product,"PRODUCT_PRICE");String received=f.db.tickets.get(id).get("received_snapshot_json").toString();
  publication(f,"2026-09-24","3000","B1");reject(f,id,product);ok(received.equals(f.db.tickets.get(id).get("received_snapshot_json")),"original evidence unchanged");
  publication(f,"2026-09-24","4000","B1");ok("UPDATED".equals(f.service.action(id,new Action(0,"VERIFY_CHANGED","가격 수정",null,f.targets.current(product,1L).fingerprint()),ADMIN).get("resolution")),"real price change detected");
  f=new ReliabilityTest.Fixture();publication(f,"2026-09-17","3000","B1");id=report(f,booth,"PARTICIPATION_LOCATION");
  publication(f,"2026-09-24","9999","B1");reject(f,id,booth); // even a REAL unrelated price change is not a booth-location correction
  publication(f,"2026-09-24","9999","Z1");ok("UPDATED".equals(f.service.action(id,new Action(0,"VERIFY_CHANGED","위치 수정",null,f.targets.current(booth,1L).fingerprint()),ADMIN).get("resolution")),"location change resolves");
  var old=values("data",product("old","3000"));var newer=values("data",product("new","3000"));ok(SupportComparison.business(old,product,"PRODUCT_PRICE").equals(SupportComparison.business(newer,product,"PRODUCT_PRICE")),"legacy product projection excludes metadata");
  ok(SupportComparison.business(Map.of(),product,"PRODUCT_PRICE").isEmpty(),"missing original cannot be reconstructed from current state");
  ok(SupportComparison.business(old,product,"PARTICIPATION_LOCATION").isEmpty(),"product cannot prove parent location");
  Target event=new Target("CATALOG","EVENT",10,10L,null,null,null,null);
  var e1=values("data",values("name","행사","operationStatus",values("state","CANCELED","note","취소","checkedOn","2026-09-17")));
  var e2=values("data",values("name","행사","operationStatus",values("state","CANCELED","note","취소","checkedOn","2026-09-24")));
  ok(SupportComparison.business(e1,event,"SCHEDULE_PLACE").equals(SupportComparison.business(e2,event,"SCHEDULE_PLACE")),"operation verification date excluded");
  e2.put("data",values("name","행사","operationStatus",values("state","SCHEDULED","note","재개")));
  ok(!SupportComparison.business(e1,event,"SCHEDULE_PLACE").equals(SupportComparison.business(e2,event,"SCHEDULE_PLACE")),"real operation change detected");
  Target asset=new Target("CATALOG","ASSET",10,41L,null,null,null,null);
  var a1=values("data",values("type","PRODUCT","url","https://x.test/a.png","credit","작가","updatedAt","old"));
  var a2=values("data",values("type","PRODUCT","url","https://x.test/a.png","credit","작가","updatedAt","new"));
  ok(SupportComparison.business(a1,asset,"OTHER").equals(SupportComparison.business(a2,asset,"OTHER")),"asset updatedAt excluded");
  ((Map<String,Object>)a2.get("data")).put("url","https://x.test/b.png");ok(!SupportComparison.business(a1,asset,"OTHER").equals(SupportComparison.business(a2,asset,"OTHER")),"asset content url changed");
  // Http-facing admission commits before business service invocation (order fixture, not a proxy).
  final List<String> calls=new ArrayList<>();final var db=new FakeDb();
  var rates=new SupportRateLimiter(db){@Override public int hit(String key){calls.add("rate");return 1;}};
  var inner=new SupportService(db,new tools.jackson.databind.json.JsonMapper(),null,rates,false,""){@Override public Map<String,Object> create(Create c,Principal p){calls.add("business");throw ApiException.badRequest("invalid");}};
  var facade=new SupportOperations(inner,rates,null,null,"");
  fails(400,()->facade.create(null,USER));ok(calls.equals(List.of("rate","business")),"invalid business attempt still rate-counted before business");
  calls.clear();fails(403,()->facade.create(null,new Principal(null,false,true)));ok(calls.isEmpty(),"unauthed cannot reach business");
  var blocked=new SupportOperations(inner,new SupportRateLimiter(db){@Override public int hit(String k){return 11;}},null,null,"");fails(429,()->blocked.create(null,USER));ok(calls.isEmpty(),"rate denial before business");
  // Attachment phases: reserve first, IO outside that method, finalize after successful PUT.
  f=new ReliabilityTest.Fixture();UUID inquiry=f.ticket("INQUIRY",null);final var fixture=f;final int[] puts={0};
  var store=new PrivateSupportStorage(){@Override public void put(String key,String type,byte[] bytes,String sha){puts[0]++;ok(fixture.db.attachments.size()==1,"quota reserved before storage");ok("PENDING".equals(fixture.db.attachments.values().iterator().next().get("state")),"not publicly readable during PUT");super.put(key,type,bytes,sha);}};
  var uploader=new SupportAttachments(new SupportAttachmentTransactions(f.service),store,new SupportRateLimiter(f.db),1);byte[] png={(byte)137,80,78,71,13,10,26,10};String sha=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(png));AttachmentInput file=new AttachmentInput(UUID.randomUUID(),"image/png",png.length,sha);
  uploader.upload(inquiry,file,USER,new ByteArrayInputStream(png));ok("STORED".equals(f.db.attachments.get(file.uploadId()).get("state")),"finalized after PUT");uploader.upload(inquiry,file,USER,new ByteArrayInputStream(png));ok(puts[0]==1,"replay no second PUT");
  final var badInput=new AttachmentInput(UUID.randomUUID(),"image/png",png.length,"0".repeat(64));try{uploader.upload(inquiry,badInput,USER,new ByteArrayInputStream(png));throw new AssertionError("invalid body");}catch(ApiException ex){ok(ex.status.value()==400,"body mismatch rejected");}ok(!f.db.attachments.containsKey(badInput.uploadId()),"invalid bytes release reservation");
  System.out.println("PASS v14 content/admission/attachment "+count+" assertions + explicit rejection controls; mocked JDBC/storage, no transaction claim");
 }
}
