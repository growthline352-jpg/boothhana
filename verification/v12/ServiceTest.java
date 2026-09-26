package com.boothhana.support;
import java.util.*;import java.sql.Timestamp;import java.time.Instant;import java.io.*;
import com.boothhana.api.ApiException;
import com.boothhana.collection.CatalogPublicationService;
import com.boothhana.floorplan.FloorplanService;
import com.boothhana.service.PlatformService;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import static com.boothhana.support.SupportModels.*;
/** Actual service functions, scripted JDBC/JSON/object store. NOT PostgreSQL transaction tests. */
public class ServiceTest {
 static int assertions;static void check(boolean b,String m){assertions++;if(!b)throw new AssertionError(m);}
 static void fails(int status,Runnable r){assertions++;try{r.run();}catch(ApiException e){if(e.status.value()!=status)throw new AssertionError("expected "+status+" got "+e.status,e);return;}throw new AssertionError("Expected "+status);}
 static Map<String,Object> values(Object... args){var m=new LinkedHashMap<String,Object>();for(int i=0;i<args.length;i+=2)m.put(args[i].toString(),args[i+1]);return m;}
 static class FakeDb extends JdbcTemplate{
  final Map<UUID,Map<String,Object>> tickets=new LinkedHashMap<>(),messages=new LinkedHashMap<>(),attachments=new LinkedHashMap<>();final List<Map<String,Object>> actions=new ArrayList<>();final Map<String,Long> rate=new HashMap<>();Map<String,Object> manager;
  @Override public void execute(String s){}
  @Override @SuppressWarnings("unchecked") public <T>T queryForObject(String sql,Class<T> t,Object...a){
   if(sql.startsWith("insert into support_rate_limit")){long n=rate.merge(a[0].toString(),1L,Long::sum);return (T)Integer.valueOf((int)n);}
   if(sql.startsWith("select count(*) from support_message"))return (T)Long.valueOf(messages.values().stream().filter(x->a[0].equals(x.get("ticket_id"))).filter(x->!sql.contains("message_kind='DIALOGUE'")||!"SYSTEM".equals(x.get("message_kind"))).count());
   if(sql.startsWith("select count(*) from support_attachment"))return (T)Long.valueOf(attachments.values().stream().filter(x->a[0].equals(x.get("ticket_id"))).count());
   if(sql.startsWith("select count(*) from support_ticket"))return (T)Long.valueOf(tickets.size());
   throw new AssertionError("Unscripted scalar: "+sql);
  }
  @Override public List<Map<String,Object>> queryForList(String sql,Object...a){
   if(sql.contains("pg_advisory_xact_lock"))return List.of(Map.of());
   if(sql.startsWith("select id from support_ticket where id=")){var x=tickets.get(a[0]);return x!=null&&Objects.equals(a[1],x.get("requester_id"))?List.of(values("id",a[0])):List.of();}
   if(sql.startsWith("select * from support_ticket where id=")){var x=tickets.get(a[0]);return x==null?List.of():List.of(x);}
   if(sql.startsWith("select * from support_message where id=")){var x=messages.get(a[0]);return x==null?List.of():List.of(x);}
   if(sql.startsWith("select id,actor_kind"))return messages.values().stream().filter(x->a[0].equals(x.get("ticket_id"))).filter(x->!sql.contains("visibility='PUBLIC'")||x.get("visibility").equals("PUBLIC")).toList();
   if(sql.startsWith("select * from support_attachment where id=")){var x=attachments.get(a[0]);return x==null||a.length>1&&!a[1].equals(x.get("ticket_id"))?List.of():List.of(x);}
   if(sql.startsWith("select id,content_type"))return attachments.values().stream().filter(x->a[0].equals(x.get("ticket_id"))).toList();
   if(sql.startsWith("select actor_id,action"))return actions.stream().filter(x->a[0].equals(x.get("ticket_id"))).toList();
   if(sql.startsWith("select revision,review_state"))return List.of(values("revision",0L,"review_state","REVIEWED"));
   if(sql.startsWith("select e.id,e.name,e.profile_json"))return List.of(values("id",99L,"name","작가 A","profile_json",new JsonMapper().writeValueAsString(values("name","작가 A","profileUrl","https://official.example/a"))));
   if(sql.contains("from exhibitor_manager"))return manager==null?List.of():List.of(manager);
   if(sql.startsWith("select id from subculture_exhibitor"))return List.of(values("id",99L));
   if(sql.startsWith("select 1 from support_ticket"))return List.of();
   throw new AssertionError("Unscripted query: "+sql);
  }
  @Override public int update(String sql,Object...a){
   if(sql.contains("insert into support_ticket(")){
    String[] fields={"id","requester_id","subject_key","request_hash","guest_secret_hash","guest_expires_at","kind","category","title","target_json","received_snapshot_json","received_fingerprint","client_context_json","exhibitor_id"};var t=values("status","OPEN","revision",0L,"created_at",Timestamp.from(Instant.now()),"updated_at",Timestamp.from(Instant.now()),"resolution",null);for(int i=0;i<fields.length;i++)t.put(fields[i],a[i]);tickets.put((UUID)a[0],t);return 1;
   }
   if(sql.startsWith("insert into support_message")){String[] fs={"id","ticket_id","actor_id","actor_kind","visibility","body","evidence_json","request_hash","message_kind"};var t=values("created_at",Timestamp.from(Instant.now()));for(int i=0;i<fs.length;i++)t.put(fs[i],a[i]);messages.put((UUID)a[0],t);return 1;}
   if(sql.startsWith("insert into support_action")){actions.add(values("ticket_id",a[0],"actor_id",a[1],"action",a[2],"details_json",a[3],"created_at",Timestamp.from(Instant.now())));return 1;}
   if(sql.startsWith("update support_ticket set assigned_to")){var t=tickets.get(a[a.length-1]);t.put("assigned_to",a[0]);bump(t);return 1;}
   if(sql.startsWith("update support_ticket set status=?,revision=")){var t=tickets.get(a[a.length-1]);t.put("status",a[0]);if(Boolean.FALSE.equals(a[1])){t.put("resolution",null);t.put("resolved_at",null);t.put("verified_result_json",null);}bump(t);return 1;}
   if(sql.startsWith("update support_ticket set status=?,resolution=")){var t=tickets.get(a[a.length-1]);t.put("status",a[0]);t.put("resolution",a[1]);t.put("verified_result_json",a[2]);bump(t);return 1;}
   if(sql.startsWith("update support_ticket set status='OPEN'")){var t=tickets.get(a[0]);t.put("status","OPEN");t.put("resolution",null);t.put("resolved_at",null);t.put("verified_result_json",null);bump(t);return 1;}
   if(sql.startsWith("update support_ticket set status='RESOLVED',resolution='HIDDEN'")){var t=tickets.get(a[1]);t.put("status","RESOLVED");t.put("resolution","HIDDEN");t.put("verified_result_json",a[0]);bump(t);return 1;}
   if(sql.startsWith("update support_ticket set status='RESOLVED'")){var t=tickets.get(a[a.length-1]);t.put("status","RESOLVED");t.put("resolution",a[0]);bump(t);return 1;}
   if(sql.startsWith("update support_ticket set revision=")){bump(tickets.get(a[0]));return 1;}
   if(sql.startsWith("insert into support_attachment")){String[] fs={"id","ticket_id","owner_id","content_type","byte_size","sha256","object_key"};var t=values("state",sql.contains("'PENDING'")?"PENDING":"STORED","created_at",Timestamp.from(Instant.now()));for(int i=0;i<fs.length;i++)t.put(fs[i],a[i]);attachments.put((UUID)a[0],t);return 1;}
   if(sql.startsWith("update support_attachment set state=")){var r=attachments.get(a[0]);if(r==null)return 0;r.put("state","STORED");return 1;}
   if(sql.startsWith("delete from support_attachment")){var r=attachments.get(a[0]);if(r!=null&&"PENDING".equals(r.get("state"))&&a[1].equals(r.get("ticket_id"))){attachments.remove(a[0]);return 1;}return 0;}
   if(sql.contains("insert into exhibitor_manager")){manager=values("exhibitor_id",a[0],"user_id",a[1],"claim_ticket_id",a[2],"state","ACTIVE","revision",0L);return 1;}
   if(sql.startsWith("update exhibitor_manager set state=")){manager.put("state","REVOKED");manager.put("revision",1L);return 1;}
   throw new AssertionError("Unscripted mutation: "+sql);
  }
  private void bump(Map<String,Object> t){t.put("revision",((Number)t.get("revision")).longValue()+1);t.put("updated_at",Timestamp.from(Instant.now()));}
 }
 static long revision(Map<String,Object> t){return ((Number)t.get("revision")).longValue();}
 @SuppressWarnings("unchecked") static List<Map<String,Object>> messages(Map<String,Object> t){return (List<Map<String,Object>>)t.get("messages");}
 public static void main(String[]args)throws Exception{
  var db=new FakeDb();var json=new JsonMapper();var pub=new CatalogPublicationService();var plans=new FloorplanService();
  pub.data=values("event",values("name","가상 행사","operationStatus","SCHEDULED"),"publishedAt","2026-09-17", "participants",List.of(values("id",21L,"participant",values("registrationName","공동 부스","members",List.of(values("name","작가 A","profileUrl","https://official.example/a"))),"productRows",List.of(values("id",31L,"data",values("name","키링"))))),"assets",List.of(values("id",41L,"type","BANNER")));
  var targets=new SupportTargets(pub,plans,new PlatformService(),db,json);var limiter=new SupportRateLimiter(db);var service=new SupportService(db,json,targets,limiter,true,"secret-for-mock-".repeat(4));var owner=new Principal(1L,false,false);var other=new Principal(2L,false,false);var admin=new Principal(9L,true,false);
  UUID id=UUID.randomUUID();var input=new Create(id,"INQUIRY","SERVICE","문의 제목","가상 문의 내용",List.of(),null,Map.of(),null);
  var t=service.create(input,owner);check(t.get("status").equals("OPEN"),"created");check(db.tickets.size()==1&&db.messages.size()==1,"single insert");service.create(input,owner);check(db.tickets.size()==1&&db.messages.size()==1,"replay idempotent");fails(409,()->service.create(input,other));fails(404,()->service.detail(id,other));
  t=service.message(id,new Message(UUID.randomUUID(),0,"내부메모: 비공개",List.of(),true),admin);check(messages(t).size()==2,"admin sees note");t=service.detail(id,owner);check(messages(t).size()==1&&!t.containsKey("actions")&&!t.containsKey("requesterId"),"private note and admin fields omitted");check(!t.toString().contains("내부메모"),"no note in owner JSON");
  var answer=new Message(UUID.randomUUID(),1,"공개 답변",List.of(),false);t=service.message(id,answer,admin);check(t.get("status").equals("ANSWERED"),"inquiry answered");long rev=revision(t);service.message(id,answer,admin);check(revision(service.detail(id,admin))==rev,"same reply not duplicated");fails(409,()->service.message(id,new Message(UUID.randomUUID(),0,"stale",List.of(),false),owner));
  t=service.action(id,new Action(rev,"CLOSE","답변 확인 후 종료",null,null),admin);check(t.get("status").equals("CLOSED"),"closed");String resolution=t.get("resolution").toString();long before=revision(t);t=service.action(id,new Action(before,"ASSIGN_SELF","담당 배정",null,null),admin);check(t.get("resolution").equals(resolution),"assignment preserves resolution");check(messages(t).stream().noneMatch(x->x.get("body").equals("담당 배정")),"assignment stays internal");fails(409,()->service.message(id,new Message(UUID.randomUUID(),revision(service.detail(id,owner)),"reply",List.of(),false),owner));
  t=service.action(id,new Action(revision(t),"REOPEN","추가 확인",null,null),admin);check(t.get("status").equals("OPEN"),"reopen");
  var target=new Target("CATALOG","EVENT",10,10L,null,null,"2026-10-10","1관");UUID report=UUID.randomUUID();t=service.create(new Create(report,"REPORT","SCHEDULE_PLACE","날짜 오류","행사 확인",List.of(),target,Map.of("viewedVersion","old-public"),null),owner);check(t.get("receivedSnapshot").toString().contains("가상 행사"),"server snapshot");check(t.get("clientContext").toString().contains("old-public"),"client provenance separate");var initial=targets.resolve(target,null);pub.data.put("publishedAt","different-time-only");fails(409,()->service.action(report,new Action(0,"VERIFY_CHANGED","정정 안내",null,initial.fingerprint()),admin));check(service.detail(report,owner).get("status").equals("OPEN"),"no completed lie");
  pub.data.put("event",values("name","가상 행사","operationStatus","CANCELED"));var changed=targets.resolve(target,null);fails(409,()->service.action(report,new Action(0,"VERIFY_CHANGED","정정 안내",null,initial.fingerprint()),admin));t=service.action(report,new Action(0,"VERIFY_CHANGED","공개 취소 안내로 수정했습니다.",null,changed.fingerprint()),admin);check(t.get("resolution").equals("UPDATED"),"changed evidence closure");check(t.get("verifiedResult").toString().contains(changed.fingerprint()),"proof stored");
  t=service.message(report,new Message(UUID.randomUUID(),revision(t),"아직 다른 부분이 틀렸어요",List.of(),false),owner);check(t.get("status").equals("OPEN")&&t.get("resolution")==null,"followup reopens and clears old resolution");
  UUID guestId=UUID.randomUUID();String key="K".repeat(43);var guestInput=new Create(guestId,"INQUIRY","ACCOUNT","로그인 문의","로그인 실패 설명",List.of(),null,Map.of(),null);service.guestCreate(new GuestCreate(guestInput,key,""),"127.0.0.1");check(!db.tickets.get(guestId).toString().contains(key),"raw secret not persisted");check(service.guestRead(new GuestAccess(guestId,key),"127.0.0.1").get("id").equals(guestId.toString()),"guest lookup");fails(404,()->service.guestRead(new GuestAccess(guestId,"Z".repeat(43)),"127.0.0.1"));fails(404,()->service.guestRead(new GuestAccess(id,key),"127.0.0.1"));fails(404,()->service.detail(guestId,owner));db.tickets.get(guestId).put("guest_expires_at",Timestamp.from(Instant.now().minusSeconds(1)));fails(404,()->service.guestRead(new GuestAccess(guestId,key),"127.0.0.1"));fails(404,()->service.guestCreate(new GuestCreate(guestInput,key,""),"127.0.0.1"));
  var person=new Target("CATALOG","PARTICIPANT",10,21L,null,null,null,null);check(targets.claimables(10,21).size()==1,"public exact member claim");fails(400,()->targets.requireClaimable(person,777));UUID claim=UUID.randomUUID();service.create(new Create(claim,"CLAIM","OWNERSHIP","운영자입니다","공식 계정 관리 근거",List.of("https://official.example/a"),person,Map.of(),99L),owner);var claims=new ExhibitorClaimsService(service);fails(403,()->claims.decide(claim,new ClaimDecision(0,"APPROVE","근거확인","승인합니다"),new Principal(1L,true,false)));t=claims.decide(claim,new ClaimDecision(0,"APPROVE","근거확인","정정 요청 관계 승인"),admin);check(t.get("resolution").equals("APPROVED")&&db.manager.get("state").equals("ACTIVE"),"grant after admin review");check(db.actions.stream().anyMatch(x->x.get("details_json").toString().contains("CORRECTION_REQUEST")),"bounded grant");fails(409,()->claims.decide(claim,new ClaimDecision(0,"REJECT","old","반려"),admin));claims.revoke(99,1,new Revoke(0,"공식 운영 관계 종료"),admin);check(db.manager.get("state").equals("REVOKED"),"revoke");check(messages(service.detail(claim,owner)).stream().anyMatch(x->x.get("body").toString().contains("해제")),"revocation owner notice");
  var store=new PrivateSupportStorage();var attachments=new SupportAttachments(new SupportAttachmentTransactions(service),store,limiter,4);byte[] png={(byte)137,80,78,71,13,10,26,10};String sha=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(png));UUID upload=UUID.randomUUID();attachments.upload(id,new AttachmentInput(upload,"image/png",png.length,sha),owner,new ByteArrayInputStream(png));check(db.attachments.size()==1&&store.files.size()==1,"private attachment");attachments.upload(id,new AttachmentInput(upload,"image/png",png.length,sha),owner,new ByteArrayInputStream(png));check(db.attachments.size()==1,"upload replay");check(!service.detail(id,owner).toString().contains("support/"),"private key not returned");check(attachments.download(id,upload,owner).bytes().length==png.length,"owner download");fails(404,()->attachments.download(id,upload,other));check(attachments.download(id,upload,admin).bytes().length==png.length,"admin download");
  check(SupportRules.canRead(1L,new Principal(1L,false,false)),"same account fan/creator no separate identity");
  for(int i=0;i<2;i++)check(targets.resolve(new Target("CATALOG","PRODUCT",10,31L,null,null,null,null),null).label().equals("키링"),"product real parent");fails(404,()->targets.resolve(new Target("CATALOG","PRODUCT",10,32L,null,null,null,null),null));
  System.out.println("PASS v12 "+assertions+" actual support/service assertions (scripted JDBC/JSON/private-store boundaries; transactions & SQL NOT executed)");
 }
}
