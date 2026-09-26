package com.boothhana.support;

import java.util.*;
import java.io.*;
import com.boothhana.api.ApiException;
import com.boothhana.collection.CatalogPublicationService;
import com.boothhana.floorplan.FloorplanService;
import com.boothhana.service.PlatformService;
import tools.jackson.databind.json.JsonMapper;
import static com.boothhana.support.SupportModels.*;
import static com.boothhana.support.ServiceTest.*;

/** Actual service methods; fake JDBC/storage only. NO transaction or SQL execution claim. */
public class ReliabilityTest {
 static final Principal OWNER=new Principal(1L,false,false),ADMIN=new Principal(9L,true,false);
 static final Target EVENT=new Target("CATALOG","EVENT",10,10L,null,null,null,null);
 static int tests;
 static void verify(boolean value,String label){tests++;if(!value)throw new AssertionError(label);}
 static class Fixture {
  final FakeDb db=new FakeDb();final JsonMapper json=new JsonMapper();
  final CatalogPublicationService pub=new CatalogPublicationService();final FloorplanService plans=new FloorplanService();
  final SupportTargets targets;final SupportService service;
  Fixture(){pub.data=values("event",values("name","[TEST] 행사"),"publishedAt","2026-09-17T00:00:00Z","participants",List.of(),"assets",List.of());targets=new SupportTargets(pub,plans,new PlatformService(),db,json);service=new SupportService(db,json,targets,new SupportRateLimiter(db),false,"");}
  UUID ticket(String kind,Target target){UUID id=UUID.randomUUID();service.create(new Create(id,kind,kind.equals("INQUIRY")?"SERVICE":"OTHER","[TEST] 제목","문의 본문",List.of(),target,Map.of(),null),OWNER);return id;}
  void fill(UUID ticket,int count){while(db.messages.values().stream().filter(m->ticket.equals(m.get("ticket_id"))).count()<count){UUID id=UUID.randomUUID();db.messages.put(id,values("id",id,"ticket_id",ticket,"actor_id",1L,"actor_kind","USER","visibility","PUBLIC","body","[TEST] 기록","evidence_json","[]","request_hash","hash","message_kind","DIALOGUE","created_at",java.sql.Timestamp.from(java.time.Instant.now())));}}
 }
 static Map<String,Object> plan(String id,String time,double x,long participant){return values("id",id,"state","READY","scope",values("hall","1관","zone",null,"dates",List.of("2026-10-10","2026-10-11"),"title","배치도"),"publishedAt",time,"imageUrl","https://images.example.test/immutable.png","sourceSha256","f".repeat(64),"width",1000,"height",800,"shapes",List.of(values("id","B1","label","B1","points",List.of(values("x",x,"y",0.1),values("x",0.3,"y",0.1),values("x",0.3,"y",0.3)),"status","MATCHED","links",List.of(values("participantId",participant,"dates",List.of("2026-10-10"),"method","EXACT")),"issues",List.of())));}
 public static void main(String[] args)throws Exception {
  // R12-01: support calls only nonthrowing public read; no transaction proxy in THIS fixture.
  Fixture f=new Fixture();f.pub.data.clear();verify(!f.targets.current(EVENT,1L).visible(),"missing publication is normal absence");
  CatalogPublicationService failing=new CatalogPublicationService(){@Override public Optional<Map<String,Object>> findPublicDetail(long id){throw new IllegalStateException("fake DB outage");}};
  try{new SupportTargets(failing,f.plans,new PlatformService(),f.db,f.json).current(EVENT,1L);throw new AssertionError("DB outage swallowed");}catch(IllegalStateException expected){verify(true,"infrastructure exception propagated");}
  // R12-02: same image/geometry, only republishedAt changed: cannot mark corrected.
  f=new Fixture();String pid=UUID.randomUUID().toString();Target map=new Target("CATALOG","FLOORPLAN",10,null,pid,null,null,null);
  f.plans.data=Map.of("plans",List.of(plan(pid,"2026-09-17T00:00:00Z",0.1,21)));UUID ticket=f.ticket("REPORT",map);
  String before=(String)f.db.tickets.get(ticket).get("received_fingerprint");
  f.plans.data=Map.of("plans",List.of(plan(pid,"2026-09-17T01:00:00Z",0.1,21)));
  verify(before.equals(f.targets.current(map,1L).fingerprint()),"time ignored");
  final Fixture unchanged=f;fails(409,()->unchanged.service.action(ticket,new Action(0,"VERIFY_CHANGED","확인",null,before),ADMIN));verify(f.db.tickets.get(ticket).get("status").equals("OPEN"),"unchanged report open");
  f.plans.data=Map.of("plans",List.of(plan(pid,"later",0.15,21)));String changed=f.targets.current(map,1L).fingerprint();verify(!before.equals(changed),"whole geometry preserved and compared");
  verify("UPDATED".equals(f.service.action(ticket,new Action(0,"VERIFY_CHANGED","좌표 수정 확인",null,changed),ADMIN).get("resolution")),"changed geometry resolves");
  // Explicit scope prevents another area changing from fixing the selected one.
  var p=plan(pid,"time",0.1,21);p.put("selectedShape",((List<?>)p.get("shapes")).getFirst());
  Object selected=SupportComparison.floorplan(p,"B1");p.put("shapes",List.of());verify(selected.equals(SupportComparison.floorplan(p,"B1")),"selected scope independent of unrelated shapes");
  p=plan(pid,"t",0.1,21);var same=plan(pid,"new t",0.1,21);same.put("scope",values("dates",List.of("2026-10-11","2026-10-10"),"hall","1관","title","label only"));verify(SupportComparison.floorplan(p,null).equals(SupportComparison.floorplan(same,null)),"scope order/provenance irrelevant");
  var linkChanged=plan(pid,"t",0.1,22);verify(!SupportComparison.floorplan(p,null).equals(SupportComparison.floorplan(linkChanged,null)),"mapping change captured");
  var dateChanged=plan(pid,"t",0.1,21);dateChanged.put("scope",values("hall","1관","dates",List.of("2026-10-11")));verify(!SupportComparison.floorplan(p,null).equals(SupportComparison.floorplan(dateChanged,null)),"date scope captured");
  Fixture legacy=new Fixture();legacy.plans.data=Map.of("plans",List.of(plan(pid,"t",0.1,21)));UUID old=legacy.ticket("REPORT",map);Map<String,Object> snapshot=legacy.service.obj(legacy.db.tickets.get(old).get("received_snapshot_json"));snapshot.remove("comparisonVersion");snapshot.remove("comparisonData");legacy.db.tickets.get(old).put("received_snapshot_json",legacy.json.writeValueAsString(snapshot));legacy.plans.data=Map.of("plans",List.of(plan(pid,"t",0.15,21)));String newFp=legacy.targets.current(map,1L).fingerprint();fails(409,()->legacy.service.action(old,new Action(0,"VERIFY_CHANGED","정정 확인",null,newFp),ADMIN));verify(Boolean.FALSE.equals(legacy.service.detail(old,ADMIN).get("contentComparisonAvailable")),"legacy limitation explicit");
  legacy.pub.data.clear();var gone=legacy.targets.current(map,1L);verify(!gone.visible(),"hidden legacy allowed for visibility proof");verify("HIDDEN".equals(legacy.service.action(old,new Action(0,"VERIFY_CHANGED","공개 중지 확인",null,gone.fingerprint()),ADMIN).get("resolution")),"legacy hidden resolves without fabricating geometry");
  // R12-03: evidence-only submission reopens exactly once, even a replay after closure.
  f=new Fixture();UUID inquiry=f.ticket("INQUIRY",null);f.service.action(inquiry,new Action(0,"WAIT","사진을 보내주세요",null,null),ADMIN);
  var store=new PrivateSupportStorage();var attachments=new SupportAttachments(new SupportAttachmentTransactions(f.service),store,new SupportRateLimiter(f.db),4);byte[] png={(byte)137,80,78,71,13,10,26,10};String sha=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(png));var input=new AttachmentInput(UUID.randomUUID(),"image/png",png.length,sha);
  attachments.upload(inquiry,input,OWNER,new ByteArrayInputStream(png));verify("OPEN".equals(f.db.tickets.get(inquiry).get("status")),"image submission opens ticket");long rev=revision(f.db.tickets.get(inquiry));int actions=f.db.actions.size();f.db.tickets.get(inquiry).put("status","CLOSED");attachments.upload(inquiry,input,OWNER,new ByteArrayInputStream(png));verify(rev==revision(f.db.tickets.get(inquiry))&&actions==f.db.actions.size(),"replay has no state or audit mutation");verify("CLOSED".equals(f.db.tickets.get(inquiry).get("status")),"replay does not reopen closed ticket");
  // R12-04: system notices do not use the dialogue quota or bypass user identity.
  f=new Fixture();UUID full=f.ticket("INQUIRY",null);f.fill(full,200);verify(f.service.dialogueCount(full)==200,"quota fixture full");f.service.action(full,new Action(0,"WAIT","추가 자료 요청",null,null),ADMIN);verify(f.service.dialogueCount(full)==200,"system notice excluded from quota");verify(f.db.messages.size()==201,"system notice stored");final Fixture capped=f;fails(409,()->capped.service.message(full,new Message(UUID.randomUUID(),1,"새 대화",List.of(),false),OWNER));fails(403,()->capped.service.insertSystemMessage(full,OWNER,"위조 안내"));
  var row=f.db.tickets.get(full);row.put("kind","CLAIM");row.put("status","RESOLVED");row.put("resolution","APPROVED");row.put("exhibitor_id",99L);f.db.manager=values("exhibitor_id",99L,"user_id",1L,"claim_ticket_id",full,"state","ACTIVE","revision",0L);new ExhibitorClaimsService(f.service).revoke(99,1,new Revoke(0,"공식 운영 관계 종료"),ADMIN);verify("REVOKED".equals(f.db.manager.get("state")),"quota does not block mandatory revoke");verify(f.db.messages.size()==202,"revocation notice visible");
  // R12-05: the receipt probe is owner-only, and not tied to current public target availability.
  verify(Boolean.TRUE.equals(f.service.receipt(full,OWNER).get("found")),"owner receipt found");verify(Boolean.FALSE.equals(f.service.receipt(full,new Principal(2L,false,false)).get("found")),"other owner's ID indistinguishable from absent");verify(Boolean.FALSE.equals(f.service.receipt(UUID.randomUUID(),OWNER).get("found")),"missing receipt");
  System.out.println("PASS v13 "+tests+" assertions + explicit 409/403 controls (actual support methods, fake DB/storage; NOT Spring transactions)");
 }
}
