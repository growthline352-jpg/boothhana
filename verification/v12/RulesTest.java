import java.util.*;
import com.boothhana.support.*;
import static com.boothhana.support.SupportModels.*;
import com.boothhana.security.LoginReturnPath;
import com.boothhana.service.ApplicationRules;

public class RulesTest {
 static int n;
 static void check(boolean ok,String title){n++;if(!ok)throw new AssertionError(title);}
 static void bad(Runnable r){n++;try{r.run();}catch(IllegalArgumentException expected){return;}throw new AssertionError("Expected validation rejection");}
 static Create create(String kind,String category,Target target){return new Create(UUID.randomUUID(),kind,category,"제목","내용",List.of(),target,Map.of(),null);}
 public static void main(String[] args){
  var event=new Target("CATALOG","EVENT",1,1L,null,null,null,null);
  SupportRules.create(create("REPORT","OTHER",event));check(true,"report allowed");
  for(String c:SupportRules.INQUIRY_REASONS){SupportRules.create(create("INQUIRY",c,null));check(true,c);}
  for(String c:SupportRules.REPORT_REASONS){SupportRules.create(create("REPORT",c,event));check(true,c);}
  bad(()->SupportRules.create(null));bad(()->SupportRules.create(create(null,"OTHER",null)));bad(()->SupportRules.create(create("BAD","OTHER",event)));bad(()->SupportRules.create(create("REPORT",null,event)));bad(()->SupportRules.create(create("REPORT","OTHER",null)));bad(()->SupportRules.create(create("REPORT","ACCOUNT",event)));
  bad(()->SupportRules.create(create("CLAIM","OWNERSHIP",event)));
  var claim=new Create(UUID.randomUUID(),"CLAIM","OWNERSHIP","사업자 등록 없어도","내 공식 계정",List.of("https://official.example/profile"),event,Map.of(),1L);SupportRules.create(claim);check(true,"claim requires evidence but no guessed legal identity");
  for(String val:new String[]{"javascript:alert(1)","file:///tmp/a","http://user:password@host.test/","http://[broken","relative", "https://host.test/\\path"})bad(()->SupportRules.evidence(List.of(val)));
  SupportRules.evidence(List.of("https://official.example/a?q=hello","http://example.test/"));check(true,"public evidence no network fetch");
  bad(()->SupportRules.evidence(Collections.nCopies(6,"https://example.test")));
  bad(()->SupportRules.text(" ",10,true));bad(()->SupportRules.text("x".repeat(11),10,false));bad(()->SupportRules.text("null\0",100,true));check(SupportRules.text(" ok ",3,true).equals("ok"),"strip");
  Map<String,String> context=new HashMap<>();context.put("userId","evil");bad(()->SupportRules.create(new Create(UUID.randomUUID(),"INQUIRY","OTHER","x","x",List.of(),null,context,null)));
  var owner=new Principal(1L,false,false);var other=new Principal(2L,false,false);var admin=new Principal(9L,true,false);var guest=new Principal(null,false,true);
  check(SupportRules.canRead(1L,owner),"own");check(!SupportRules.canRead(2L,owner),"not other");check(!SupportRules.canRead(1L,other),"not other even creator");check(SupportRules.canRead(1L,admin),"explicit admin");check(!SupportRules.canRead(1L,guest),"guest never account");check(!SupportRules.canRead(null,owner),"account not guest");check(!SupportRules.canRead(1L,null),"anonymous denied");check(SupportRules.canRead(null,guest),"only after token boundary authenticates requested ticket");
  bad(()->SupportRules.message(new Message(UUID.randomUUID(),0,"private",List.of(),true),false));SupportRules.message(new Message(UUID.randomUUID(),0,"private",List.of(),true),true);check(true,"internal admin only");bad(()->SupportRules.message(new Message(null,0,"x",List.of(),false),false));bad(()->SupportRules.message(new Message(UUID.randomUUID(),-1,"x",List.of(),false),false));
  for(String k:List.of("REPORT","INQUIRY","CLAIM")){check(SupportRules.transitioned(k,"OPEN","START").equals("IN_PROGRESS"),"start");check(SupportRules.transitioned(k,"OPEN","WAIT").equals("WAITING_USER"),"wait");check(SupportRules.transitioned(k,"OPEN","ASSIGN_SELF").equals("OPEN"),"assign no resolve");}
  for(String action:List.of("VERIFY_CHANGED","HIDE","CORRECT","NO_CHANGE","DUPLICATE","OTHER")){check(SupportRules.transitioned("REPORT","OPEN",action).equals("RESOLVED"),"report result");bad(()->SupportRules.transitioned("REPORT","RESOLVED",action));bad(()->SupportRules.transitioned("INQUIRY","OPEN",action));}
  check(SupportRules.transitioned("INQUIRY","ANSWERED","CLOSE").equals("CLOSED"),"close after reply");bad(()->SupportRules.transitioned("INQUIRY","OPEN","CLOSE"));bad(()->SupportRules.transitioned("CLAIM","RESOLVED","REOPEN"));bad(()->SupportRules.transitioned("REPORT","OPEN",null));bad(()->SupportRules.transitioned("REPORT","OPEN","DELETE"));
  check(SupportRules.guestHash("A".repeat(43)).length()==64,"hash only");for(String s:List.of("", "a".repeat(42),"a".repeat(44),"!".repeat(43)))bad(()->SupportRules.guestHash(s));bad(()->SupportRules.guestHash(null));check(SupportRules.constantEquals("a","a"),"constant compare");check(!SupportRules.constantEquals("a","b"),"no match");check(!SupportRules.constantEquals(null,"a"),"null no match");
  for(String path:List.of("/","/discover/42?day=2026-10-10&booth=3","/support/new?kind=REPORT","/support/tickets/23","/creator/events","/admin/reports","/products/3","/booths/3/reserve"))check(LoginReturnPath.safe(path).equals(path),"return "+path);
  for(String path:List.of("https://evil.test","//evil.test","/\\evil.test","/%2f%2fevil.test","/support%0d%0aLocation:https://evil.test","/../evil","/support/../admin","javascript:alert(1)","/api/admin/tables","/"+"x".repeat(2200)))check(LoginReturnPath.safe(path).equals("/"),"deny "+path.substring(0,Math.min(path.length(),40)));
  check(LoginReturnPath.safe(null).equals("/"),"null safe");
  check(ApplicationRules.next("PENDING","APPROVE",true).equals("APPROVED"),"approve");check(ApplicationRules.next("PENDING","REJECT",true).equals("REJECTED"),"reject");check(ApplicationRules.next("REJECTED","RESUBMIT",true).equals("PENDING"),"resubmit same identity");check(ApplicationRules.next("WITHDRAWN","RESUBMIT",true).equals("PENDING"),"withdraw resubmit");check(ApplicationRules.next("PENDING","WITHDRAW",false).equals("WITHDRAWN"),"withdraw pending");
  for(String status:List.of("APPROVED","REJECTED","WITHDRAWN")){bad(()->ApplicationRules.next(status,"APPROVE",true));bad(()->ApplicationRules.next(status,"REJECT",true));bad(()->ApplicationRules.next(status,"WITHDRAW",true));}
  bad(()->ApplicationRules.next("PENDING","RESUBMIT",true));bad(()->ApplicationRules.next("REJECTED","RESUBMIT",false));bad(()->ApplicationRules.next("PENDING","APPROVE",false));bad(()->ApplicationRules.next(null,"REJECT",true));
  System.out.println("PASS v12 "+n+" pure Java validations/auth predicates/application/redirect assertions (no live framework/DB)");
 }
}
