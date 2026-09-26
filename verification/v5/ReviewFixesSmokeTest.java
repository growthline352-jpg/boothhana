import java.util.*;
import com.boothhana.collection.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;

/** Compiles real pure Java production rules; JDBC/API integration is a separate opt-in test. */
public class ReviewFixesSmokeTest {
 static int count=0;
 static void check(boolean value,String message){count++;if(!value)throw new AssertionError(message);}
 static void fails(Runnable action,String message){boolean failed=false;try{action.run();}catch(RuntimeException e){failed=true;}check(failed,message);}
 static <T>T with(T record,String field,Object value){return CatalogRulesSmokeTest.with(record,field,value);}
 static Source src(String url){return new Source(url,"OFFICIAL","ORIGINAL","[TEST] fixture evidence");}
 public static void main(String[] args){
  Participant old=CatalogRulesSmokeTest.participant();ProductData product=CatalogRulesSmokeTest.product();
  var evidence=List.of(src("https://example.com/list?page=1"),src("https://example.com/detail/entry1"));
  var identity=new Identity("https://example.com","entry1","https://example.com/detail/entry1");
  Participant p=with(with(old,"sources",evidence),"identity",identity);
  CatalogRules.participant(p);check(true,"explicit stable identity accepted");
  String key=CatalogRules.participantKey(p);
  var reverse=with(p,"sources",evidence.reversed());check(key.equals(CatalogRules.participantKey(reverse)),"evidence order stable");
  var more=with(p,"sources",List.of(src("https://news.example/repost"),evidence.getFirst(),evidence.getLast()));check(key.equals(CatalogRules.participantKey(more)),"additional unrelated evidence stable");
  check(key.equals(CatalogRules.participantKey(with(p,"registrationName","rename"))),"rename stable");
  check(key.equals(CatalogRules.participantKey(with(p,"locations",List.of(with(CatalogRulesSmokeTest.location(),"code","Z9"))))),"booth move stable");
  var other=with(with(p,"identity",new Identity("https://example.com","entry2",identity.detailUrl())),"sourceEntryId","entry2");
  check(!key.equals(CatalogRules.participantKey(other)),"different source entry not merged");
  check(CatalogIdentity.conflicts(identity,other.identity()),"distinct known IDs even if URL shared");
  check(CatalogIdentity.known(null,"entry1",evidence).entryId().equals("entry1"),"legacy ID namespace inferred only from same-system source");
  check(CatalogIdentity.known(null,"entry1",List.of(evidence.getFirst(),src("https://other.example/list")))==null,"ambiguous legacy namespace not invented");
  for(Source source:evidence){String legacy=CollectionRules.sha(source.url()+"\u001fentry1");check(CatalogIdentity.participantKeys(p).contains(legacy),"old source-ordered hash recoverable");}
  var legacy=with(p,"identity",null);check(CatalogIdentity.intersects(CatalogIdentity.participantKeys(legacy),CatalogIdentity.participantKeys(p)),"v4 alias matches upgraded identity");
  check(CatalogRules.participantKey(legacy).equals(CatalogRules.participantKey(with(legacy,"sources",evidence.reversed()))),"legacy namespace key no longer order dependent");
  check(CatalogIdentity.canonical("https://EXAMPLE.com:443/a/../b?id=2&utm_source=x#part").equals("https://example.com/b?id=2"),"canonical URL preserves entry and strips tracking");
  check(!CatalogIdentity.canonical("https://example.com/?id=2").equals(CatalogIdentity.canonical("https://example.com/?id=3")),"different query IDs preserved");
  fails(()->CatalogIdentity.validate(new Identity("https://example.com/","entry1",null),"entry1",evidence),"origin canonical no slash");
  fails(()->CatalogIdentity.validate(new Identity("https://evil.example","entry1",null),"entry1",evidence),"namespace needs evidence");
  fails(()->CatalogIdentity.validate(new Identity("https://example.com","other",null),"entry1",evidence),"external IDs agree");
  fails(()->CatalogIdentity.validate(new Identity("https://example.com","entry1","https://example.com/guessed"),"entry1",evidence),"detail URL not fabricated");
  ProductData item=with(product,"identity",new Identity("https://example.com","p1",null));
  check(CatalogRules.productKey(item).equals(CatalogRules.productKey(with(item,"sources",List.of(src("https://more.example/news"),CatalogRulesSmokeTest.source())))),"product evidence addition stable");
  var item2=with(with(item,"sourceEntryId","p2"),"identity",new Identity("https://example.com","p2",null));check(!CatalogRules.productKey(item).equals(CatalogRules.productKey(item2)),"separate variant ID");
  var edit=new EditInput(1,"REVIEWED","review only",Map.of());Map<String,Object> initial=Map.of("summary","intentional correction");
  check(CatalogReviewRules.apply(Map.of(),edit).isEmpty(),"no override on review only");
  check(CatalogReviewRules.apply(initial,edit).equals(initial),"existing intended override stays");
  var clear=new EditInput(1,"PENDING","follow source",Map.of(),List.of("summary"));
  CatalogRules.edit(clear,Set.of("summary"));check(CatalogReviewRules.apply(initial,clear).isEmpty(),"clear removes pinned field");
  var explicitNull=new HashMap<String,Object>();explicitNull.put("summary",null);
  check(CatalogReviewRules.apply(Map.of(),new EditInput(1,"PENDING","",explicitNull)).containsKey("summary"),"null distinct from removal");
  fails(()->CatalogRules.edit(new EditInput(1,"PENDING","",Map.of("summary","x"),List.of("summary")),Set.of("summary")),"set/remove same field forbidden");
  fails(()->CatalogRules.edit(new EditInput(1,"PENDING","",Map.of(),List.of("eventId")),Set.of("summary")),"cannot remove ownership field");
  List<ProductData> products=new ArrayList<>();for(int i=0;i<20;i++)products.add(with(with(item,"sourceEntryId","p"+i),"identity",new Identity("https://example.com","p"+i,null)));
  Sales full=with(CatalogRulesSmokeTest.sales(),"products",products),partial=with(full,"products",products.subList(0,2));
  Sales merged=CatalogAccumulation.snapshot(partial,full,products);check(merged.products().size()==20,"20 to partial2 retains20");
  CatalogRules.salesSnapshot(merged);check(true,"aggregate validates independently of incoming size limit");
  check(CatalogAccumulation.snapshot(null,full,products).products().size()==20,"null response preserves previous");
  check(CatalogAccumulation.snapshot(null,null,List.of())==null,"never creates made-up empty sales");
  check(CatalogAccumulation.check(true,"2026-09-16T00:00:00Z").state().equals("CONFIRMED_CURRENT"),"seen marked current");
  check(CatalogAccumulation.check(false,"2026-09-09T00:00:00Z").state().equals("NOT_RECONFIRMED"),"missing not deleted");
  check(CatalogAccumulation.check(false,"2026-09-09T00:00:00Z").lastSeenAt().equals("2026-09-09T00:00:00Z"),"historical date preserved");
  var canceled=new ArrayList<>(products);canceled.set(0,with(products.getFirst(),"saleState","CANCELED"));
  check(CatalogAccumulation.snapshot(partial,full,canceled).products().getFirst().saleState().equals("CANCELED"),"explicit cancel remains cancel");
  List<String> visited=new ArrayList<>();CursorRef ref=new CursorRef("a".repeat(64),1,0,"https://example.com/list?page=1",1);
  for(int i=1;i<=25;i++) {
   Coverage coverage=new Coverage(i==25?"COMPLETE":"PARTIAL",25,"REGISTERED_BOOTHS",List.of(ref.requestedUrl()),i==25?null:"https://example.com/list?page="+(i+1),List.of());
   var advance=CatalogCursorRules.advance(ref,coverage,visited,false);
   check(advance.pageIndex()==i,"page advances "+i);visited=advance.visited();
   if(i<25){check(advance.state().equals("ACTIVE"),"unfinished retained "+i);ref=new CursorRef(ref.sourceKey(),1,i,advance.nextPageUrl(),ref.revision()+1);}
   else check(advance.state().equals("COMPLETE"),"cycle finishes after25");
  }
  var retry=new CursorRef("b".repeat(64),1,10,"https://example.com/list?page=11",11);
  var failure=CatalogCursorRules.advance(retry,CatalogRulesSmokeTest.coverage(),List.of("https://example.com/list?page=10"),true);
  check(failure.pageIndex()==10&&failure.nextPageUrl().endsWith("=11")&&failure.state().equals("BLOCKED"),"failure retries same page");
  var loop=CatalogCursorRules.advance(retry,new Coverage("PARTIAL",null,"UNKNOWN",List.of(),retry.requestedUrl(),List.of()),List.of(),false);
  check(loop.state().equals("BLOCKED")&&loop.pageIndex()==10,"self-loop never advances indefinitely");
  var incomplete=CatalogCursorRules.advance(retry,new Coverage("UNKNOWN",null,"UNKNOWN",List.of(),null,List.of()),List.of(),false);
  check(incomplete.state().equals("BLOCKED")&&incomplete.nextPageUrl().endsWith("=11"),"unknown page retains checkpoint");
  System.out.println("PASS: "+count+" v5 Java review-fix conditions; real pure rules, no DB/API.");
 }
}
