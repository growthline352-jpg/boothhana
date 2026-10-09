package com.boothhana.collection.graph;
import com.boothhana.api.ApiException;
import com.boothhana.collection.*;
import com.boothhana.interests.InterestRules;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import java.util.function.Consumer;
import static com.boothhana.collection.graph.GraphModels.*;
import static com.boothhana.collection.graph.GraphService.*;
import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CatalogModels.*;

/** Apply only a separately reviewed immutable extraction, inside the job verdict transaction. */
@Service @ConditionalOnProperty(name="app.collection.graph.enabled",havingValue="true")
public class GraphProjection {
 private final JdbcTemplate db;private final JsonMapper json;private final CatalogService catalog;private final CollectionService events;private final CatalogPublicationService publication;private final GraphImages images;private final GraphIdentity identities;
 public GraphProjection(JdbcTemplate db,JsonMapper json,CatalogService catalog,CollectionService events,CatalogPublicationService publication,GraphImages images,GraphIdentity identities){this.db=db;this.json=json;this.catalog=catalog;this.events=events;this.publication=publication;this.images=images;this.identities=identities;}
 String encode(Object o){return json.writeValueAsString(o);}
 @SuppressWarnings("unchecked") static Map<String,Object> map(Object o){return o instanceof Map<?,?> m?(Map<String,Object>)m:Map.of();}
 @SuppressWarnings("unchecked") static List<Map<String,Object>> maps(Object o){return o instanceof List<?> l?(List<Map<String,Object>>)l:List.of();}
 <T> T as(Object o,Class<T> c){return json.readValue(encode(o),c);}
 @SuppressWarnings("unchecked") Map<String,Object> decode(Object o){return json.readValue(o.toString(),Map.class);}
 static String normalizedUrl(String value){CollectionRules.url(value);var u=java.net.URI.create(value);String path=Objects.toString(u.getRawPath(),"").replaceAll("/+$","");return u.getScheme().toLowerCase()+"://"+u.getHost().toLowerCase()+((u.getPort()==-1||u.getPort()==443&&u.getScheme().equals("https")||u.getPort()==80&&u.getScheme().equals("http"))?"":":"+u.getPort())+path+(u.getRawQuery()==null?"":"?"+u.getRawQuery());}
 public void checkSources(Map<String,Object> result,List<String> opened){var needed=new LinkedHashSet<String>();collectSources(result,needed);var available=new HashSet<String>();opened.forEach(x->available.add(normalizedUrl(x)));
  if(result.get("events") instanceof List<?> events&&events.isEmpty()&&result.containsKey("sourceCoverage")){
   var coverage=maps(result.get("sourceCoverage"));boolean complete="COMPLETE".equals(result.get("searchStatus"));
   if(complete)require(!coverage.isEmpty()&&coverage.stream().allMatch(c->Set.of("CHECKED","NO_RESULTS").contains(text(c.get("status")))&&c.get("checkedUrls") instanceof List<?> urls&&!urls.isEmpty()),"행사 없음 완료에는 출처별 확인이 필요합니다.");
   for(var c:coverage)if(Set.of("CHECKED","NO_RESULTS","PARTIAL").contains(text(c.get("status"))))for(Object url:(List<?>)c.getOrDefault("checkedUrls",List.of())){String normalized=normalizedUrl(text(url));if(complete||available.contains(normalized))needed.add(normalized);}
  }
  if(needed.isEmpty())for(Object url:(List<?>)map(result.get("coverage")).getOrDefault("visitedPages",List.of())){String normalized=normalizedUrl(text(url));if(available.contains(normalized))needed.add(normalized);}
  require(!needed.isEmpty(),"확인한 원문 근거가 없습니다.");require(available.containsAll(needed),"검토 호출에서 모든 근거 원문을 직접 확인해야 합니다.");}
 private void collectSources(Object value,Set<String> urls){if(value instanceof Map<?,?> row){
  if(row.containsKey("sources")){var sources=maps(row.get("sources"));boolean original=false;for(var s:sources)if("ORIGINAL".equals(s.get("access"))&&!text(s.get("evidence")).isBlank()){urls.add(normalizedUrl(text(s.get("url"))));original=true;}require(original,"개별 항목의 원문 근거가 필요합니다.");}
  for(var entry:row.entrySet()){if(Set.of("sourceUrl","evidenceUrl","officialUrl").contains(entry.getKey())&&entry.getValue()!=null&&!text(entry.getValue()).isBlank())urls.add(normalizedUrl(text(entry.getValue())));else if(!entry.getKey().equals("sources"))collectSources(entry.getValue(),urls);}
 }else if(value instanceof List<?> list)list.forEach(x->collectSources(x,urls));}
 public static Map<Integer,Long> existingEventTargets(Map<String,Object> result,Map<String,Object> context){
  if(!result.containsKey("existingEventRefs"))return Map.of();
  var events=maps(result.get("events"));var refs=maps(result.get("existingEventRefs"));require(refs.size()==events.size(),"모든 행사에 기존 ID 또는 신규 판정이 필요합니다.");
  var known=new HashSet<Long>();for(var e:maps(context.get("existingEvents")))known.add(number(e.get("id")));
  var seen=new HashSet<Integer>();var selected=new HashSet<Long>();var targets=new LinkedHashMap<Integer,Long>();
  for(var ref:refs){
   Object index=ref.get("eventIndex");require(index instanceof Integer||index instanceof Long,"행사 참조 순서 오류");long value=number(index);require(value>=0&&value<events.size()&&seen.add((int)value),"행사 참조가 중복되거나 범위를 벗어났습니다.");
   String reason=text(ref.get("identityReason"));require(!reason.isBlank()&&reason.length()<=1000,"행사 동일성 판단 근거가 필요합니다.");
   Object id=ref.get("existingEventId");if(id==null)continue;require(id instanceof Integer||id instanceof Long,"기존 행사 ID 형식 오류");long existing=number(id);
   require(existing>0&&known.contains(existing)&&selected.add(existing),"조사 문맥에 없는 행사 또는 중복 ID를 선택할 수 없습니다.");targets.put((int)value,existing);
  }
  return targets;
 }
 public Map<String,Object> apply(String kind,String target,Map<String,Object> input,Map<String,Object> context,Map<String,Object> result,UUID verdict,boolean baseline,Consumer<Seed> enqueue){
  var cycle=ZonedDateTime.now(ZoneId.of("Asia/Seoul"));String generation=cycle.toLocalDate()+":"+(cycle.getHour()/6);
  if(kind.equals("RELATIONS"))return GraphEventRelations.apply(db,json,identities,Long.parseLong(target),context,result,verdict);
  if(kind.equals("DISCOVERY")){
   var legacy=new LinkedHashMap<>(result);legacy.remove("existingEventRefs");
   SearchResult search=as(legacy,SearchResult.class);require(search.events().stream().allMatch(e->com.boothhana.interests.SubcultureScope.TYPES.contains(e.subcategory())),"서브컬처 범위가 아닙니다.");
   var now=Instant.now().toString();var receipt=events.ingest(new Batch("1",verdict.toString(),now,now,"CLI",true,as(input.get("scope"),Scope.class),search),existingEventTargets(result,context));require(receipt.rejected()==0,"발견 결과에 유효하지 않은 행사가 있습니다.");
   for(var ref:receipt.candidates())enqueue.accept(new Seed("EVENT",Long.toString(ref.id()),Map.of(),baseline,generation));return Map.of("verdict","APPROVE","events",receipt.candidates(),"needsEnrichment",!"COMPLETE".equals(search.searchStatus()));
  }
  if(kind.equals("EVENT")){
   var e=map(context.get("event"));long id=number(e.get("id"));var original=map(e.get("data"));for(String field:List.of("name","edition","organizer"))require(Objects.equals(result.get(field),original.get(field)),"다른 행사 회차와 병합할 수 없습니다.");var changes=new LinkedHashMap<>(result);changes.remove("banners");
   catalog.editEvent(id,new EditInput(number(e.get("revision")),"REVIEWED","LLM graph review "+verdict,changes));publish(id);
   enqueue.accept(new Seed("RELATIONS",target,Map.of(),baseline,generation));
   enqueue.accept(new Seed("PARTICIPANTS",target,Map.of(),baseline,generation));
   // Backfill current legacy entities as well: re-collection must not be necessary to preserve IDs.
   for(var p:db.queryForList("select id from subculture_participant where event_id=? and review_state<>'EXCLUDED' order by id",id))downstream(number(p.get("id")),baseline,generation,enqueue);
   return Map.of("verdict","APPROVE","eventId",id);
  }
  if(kind.equals("PARTICIPANTS")||kind.equals("SALES")){
   var e=map(context.get("event"));long eventId=number(e.get("id"));var event=as(e.get("data"),EventData.class);
   var stage=as(GraphPageBatch.legacy(result),StageResult.class);require(!"FAILED".equals(stage.searchStatus()),"실패 결과를 공개할 수 없습니다.");
   String start=event.occurrences().stream().map(Occurrence::startDate).min(String::compareTo).orElseThrow(),end=event.occurrences().stream().map(Occurrence::endDate).max(String::compareTo).orElseThrow();
   String pipeline=verdict.toString(),now=Instant.now().toString();catalog.start(new PipelineInput(pipeline,LocalDate.now(ZoneId.of("Asia/Seoul")).toString(),new Scope("SEOUL_GYEONGGI","Asia/Seoul",start,end)));
   var p=map(context.get("participant"));Long participantId=kind.equals("SALES")?number(p.get("id")):null;
   var batch=new StageBatch("4",verdict.toString(),pipeline,kind,eventId,participantId,number(kind.equals("SALES")?p.get("revision"):e.get("revision")),now,now,true,stage);
   var receipt=kind.equals("SALES")?catalog.ingestSalesContinuation(batch,GraphPageBatch.previousSalesStages(db,input,target)):catalog.ingest(batch);
   require(receipt.rejected()==0,"식별 충돌 또는 검증에 실패한 항목이 있습니다.");
   if(kind.equals("PARTICIPANTS"))for(long pid:receipt.participantIds()){
    var row=catalog.participant(pid);require(!"EXCLUDED".equals(row.reviewState()),"제외된 참가 정보입니다.");checkOverrides(row.overrides(),as(row.collectedData(),Map.class));catalog.editParticipant(pid,new EditInput(row.revision(),"REVIEWED","LLM graph review "+verdict,Map.of()));downstream(pid,baseline,generation,enqueue);
   }
   else if(stage.sales()!=null){var view=catalog.participant(participantId);require(view.sales()!=null&&!"EXCLUDED".equals(view.sales().reviewState()),"제외된 판매 정보입니다.");checkOverrides(view.sales().overrides(),as(view.sales().collectedData(),Map.class));catalog.editSales(participantId,new EditInput(view.sales().revision(),"REVIEWED","LLM graph review "+verdict,Map.of()));products(participantId,baseline,generation,enqueue);}
   catalog.finish(pipeline,new PipelineFinish("SUCCESS",Map.of("graphVerdict",verdict)));publish(eventId);
   String next=stage.coverage().nextPageUrl();if(next!=null){String nextKey=normalizedUrl(next);var seen=new ArrayList<String>();for(Object url:(List<?>)input.getOrDefault("visited",List.of()))seen.add(normalizedUrl(text(url)));String current=text(input.get("pageUrl"));if(!current.isBlank())seen.add(normalizedUrl(current));require(!seen.contains(nextKey),"페이지 순환이 발견됐습니다.");seen.add(nextKey);enqueue.accept(new Seed(kind,target,Map.of("pageUrl",next,"visited",seen),baseline,generation));}
   return Map.of("verdict","APPROVE","eventId",eventId,"coverage",stage.coverage().completeness(),"needsEnrichment",next==null&&(!Set.of("COMPLETE","NOT_APPLICABLE").contains(stage.coverage().completeness())||!"COMPLETE".equals(stage.searchStatus())));
  }
  if(kind.equals("CREATOR")){
   require(!Boolean.FALSE.equals(map(context.get("publication")).get("active")),"숨긴 작가를 자동 공개할 수 없습니다.");long id=Long.parseLong(target);var original=map(map(context.get("creator")).get("data"));var profile=map(result.get("profile"));
   Member member=as(profile,Member.class);require(member.name()!=null&&!member.name().isBlank()&&member.name().length()<=255&&Set.of("ARTIST","CIRCLE","BRAND","SHOP","HOST","CAFE","UNKNOWN").contains(member.kind())&&member.aliases()!=null&&member.aliases().size()<=20,"작가 형식 오류");
   require(Objects.equals(original.get("name"),member.name())&&Objects.equals(original.get("profileUrl"),member.profileUrl()),"같은 작가의 식별 정보인지 추가 보완이 필요합니다.");if(member.profileUrl()!=null)CollectionRules.url(member.profileUrl());
   var socialAccounts=GraphCreatorSources.merge(context,result.get("socialAccounts"));
   socialAccounts=GraphCreatorSources.checkpoint(socialAccounts,input,result);
   var publishedProfile=new LinkedHashMap<>(as(member,Map.class));publishedProfile.put("socialAccounts",socialAccounts);
   db.update("insert into collection_creator_publication(exhibitor_id,data_json,verdict_id) values(?,cast(? as jsonb),?) on conflict(exhibitor_id) do update set data_json=excluded.data_json,verdict_id=excluded.verdict_id,active=true,revision=collection_creator_publication.revision+1,updated_at=now()",id,encode(publishedProfile),verdict);
   identities.creator(id,map(result.get("identityDecision")),verdict);
   var leads=maps(result.get("eventLeads"));require(leads.size()<=50,"행사 단서 페이지 크기 초과");
   for(var lead:leads){String url=normalizedUrl(text(lead.get("sourceUrl")));InterestRules.text(text(lead.get("evidence")),1000,true);LocalDate start=LocalDate.parse(text(lead.get("startDate"))),end=LocalDate.parse(text(lead.get("endDate")));require(!start.isAfter(end)&&java.time.temporal.ChronoUnit.DAYS.between(start,end)<=365,"행사 단서 기간 오류");
    enqueue.accept(new Seed("DISCOVERY",CollectionRules.sha(url+start+end),Map.of("scope",Map.of("region","SEOUL_GYEONGGI","timezone","Asia/Seoul","startDate",start.toString(),"endDate",end.toString()),"leadUrl",url),baseline,generation));
   }
   var goods=maps(result.get("goods"));require(goods.size()<=100,"상품 페이지가 너무 큽니다.");
   var inactiveAccounts=new HashSet<String>();for(var account:socialAccounts)if(Boolean.FALSE.equals(account.get("active")))inactiveAccounts.add(text(account.get("profileUrl")));
   for(var good:goods)for(var source:maps(good.get("sources")))require(!inactiveAccounts.contains(GraphCreatorSources.sourceAccount(text(source.get("url")))),"연결을 철회한 SNS의 상품을 이 작가에게 귀속할 수 없습니다.");
   if(!inactiveAccounts.isEmpty())for(var product:db.queryForList("select id,data_json from collection_product where exhibitor_id=? and active for update",id))if(maps(decode(product.get("data_json")).get("sources")).stream().anyMatch(s->inactiveAccounts.contains(GraphCreatorSources.sourceAccount(text(s.get("url")))))){db.update("update collection_product set active=false,revision=revision+1 where id=?",product.get("id"));retireAttributions((UUID)product.get("id"));}
   for(var page:maps(result.get("productCoverage")))if(Boolean.TRUE.equals(page.get("complete"))){String url=normalizedUrl(text(page.get("sourceUrl")));var names=new HashSet<String>();for(var good:goods)if(maps(good.get("sources")).stream().anyMatch(s->"ORIGINAL".equals(s.get("access"))&&normalizedUrl(text(s.get("url"))).equals(url)))names.add(text(good.get("name")));require(names.containsAll((List<?>)page.getOrDefault("optionNames",List.of())),"완료된 판매표의 개별 옵션이 누락됐습니다.");}
   var rows=db.queryForList("select id,identity_key,identity_aliases,data_json from collection_product where exhibitor_id=? for update",id);
   var products=new ArrayList<ProductData>();var matches=new ArrayList<Map<String,Object>>();var matchedIds=new HashSet<UUID>();
   for(var good:goods){var product=GraphProductIdentity.normalize(as(good,ProductData.class));CatalogRules.product(product);require(product.memberName()!=null&&(member.name().equals(product.memberName())||member.aliases().contains(product.memberName())),"공동 판매표의 다른 작가 상품을 이 작가에게 귀속할 수 없습니다.");require(Set.of("GENERAL_CATALOG","PROFILE","PAST_REFERENCE","UNKNOWN").contains(product.evidenceScope()),"독립 작가 수집에서 행사 판매를 확정할 수 없습니다.");
    for(var other:products)require(CatalogIdentity.conflicts(GraphProductIdentity.known(product),GraphProductIdentity.known(other))||!CatalogIdentity.intersects(GraphProductIdentity.keys(product),GraphProductIdentity.keys(other)),"서로 다른 옵션에 같은 상품 식별자가 지정됐습니다.");
    var previous=GraphProductIdentity.match(product,rows,json);require(previous==null||matchedIds.add((UUID)previous.get("id")),"여러 옵션이 같은 기존 상품에 연결됩니다.");products.add(product);matches.add(previous);
   }
   for(int index=0;index<products.size();index++){var product=products.get(index);var previous=matches.get(index);var aliases=new TreeSet<>(GraphProductIdentity.keys(product));UUID productId;
    if(previous==null){productId=UUID.randomUUID();String identity=CollectionRules.sha(id+"\u001f"+GraphProductIdentity.keys(product).getFirst());
     db.update("insert into collection_product(id,exhibitor_id,identity_key,identity_aliases,data_json,verdict_id) values(?,?,?,cast(? as jsonb),cast(? as jsonb),?)",productId,id,identity,encode(aliases),encode(product),verdict);
    }else{productId=(UUID)previous.get("id");aliases.addAll(GraphProductIdentity.aliases(previous,json));
     if(!sorted(decode(previous.get("data_json"))).equals(sorted(as(product,Map.class))))retireAttributions(productId);
     db.update("update collection_product set identity_aliases=cast(? as jsonb),data_json=cast(? as jsonb),verdict_id=?,revision=revision+case when data_json=cast(? as jsonb) then 0 else 1 end where id=?",encode(aliases),encode(product),verdict,encode(product),productId);
    }
    enqueue.accept(new Seed("CHARACTERS",productId.toString(),Map.of(),baseline,generation+":"+CollectionRules.sha(encode(product))));
   }
   var saleLeads=new TreeSet<String>();for(var good:goods)for(var source:maps(good.get("sources")))if("ORIGINAL".equals(source.get("access"))&&GraphCreatorSources.salePost(text(source.get("url"))))saleLeads.add(text(source.get("url")));
   for(var booth:maps(context.get("creatorProvenance")))if(LocalDate.parse(text(booth.get("endsOn"))).compareTo(cycle.toLocalDate())>=0)for(String lead:saleLeads)enqueue.accept(new Seed("SALES",text(booth.get("participantId")),Map.of("leadUrl",lead),baseline,"sns-sale:"+verdict));
   if(!Boolean.TRUE.equals(input.get("socialPage"))&&!input.containsKey("pageUrl")&&!input.containsKey("pageBatch"))for(var account:socialAccounts){String profileUrl=text(account.get("profileUrl"));if(!Boolean.FALSE.equals(account.get("active"))&&(profileUrl.startsWith("https://x.com/")||profileUrl.startsWith("https://bsky.app/"))&&db.queryForObject("select count(*) from collection_job where kind='CREATOR' and target_id=? and state in ('PENDING','WAITING','RUNNING','VERIFYING') and input_json->>'socialPage'='true' and split_part(input_json->>'pageUrl','?',1)=?",Integer.class,target,profileUrl)==0)enqueue.accept(new Seed("CREATOR",target,Map.of("pageUrl",GraphCreatorSources.feedUrl(profileUrl),"socialPage",true,"visited",List.of(),"socialCycle",verdict.toString()),baseline||!Boolean.TRUE.equals(account.get("historyComplete")),"social:"+verdict));}
   String next=text(result.get("nextPageUrl"));if(!next.isBlank()){CollectionRules.url(next);String current=text(input.get("pageUrl"));require(!normalizedUrl(next).equals(current.isBlank()?"":normalizedUrl(current)),"반복 상품 페이지");var visited=new ArrayList<Object>((List<?>)input.getOrDefault("visited",List.of()));if(!current.isBlank())visited.add(normalizedUrl(current));require(!visited.contains(normalizedUrl(next)),"상품 페이지 순환");visited.add(normalizedUrl(next));var nextInput=new LinkedHashMap<String,Object>();nextInput.put("pageUrl",next);nextInput.put("visited",visited);if(Boolean.TRUE.equals(input.get("socialPage"))){require(db.queryForObject("select count(*) from collection_job where kind='CREATOR' and target_id=? and input_json->>'socialCycle'=? and input_json->>'pageUrl'=? and state<>'STALE'",Integer.class,target,text(input.get("socialCycle")),next)==0,"SNS 커서 순환");nextInput.put("visited",List.of());nextInput.put("socialPage",true);nextInput.put("socialCycle",input.get("socialCycle"));}enqueue.accept(new Seed("CREATOR",target,nextInput,baseline,Boolean.TRUE.equals(input.get("socialPage"))?"social:"+text(input.get("socialCycle")):generation));}
   return Map.of("verdict","APPROVE","creatorId",id,"products",goods.size(),"needsEnrichment",next.isBlank()&&(!"COMPLETE".equals(result.get("coverage"))||maps(result.get("productCoverage")).stream().anyMatch(p->!Boolean.TRUE.equals(p.get("complete")))));
  }
  require(kind.equals("CHARACTERS"),"알 수 없는 작업입니다.");UUID productId=UUID.fromString(target);var product=map(context.get("product"));int count=0;var confirmed=new ArrayList<UUID>();
  result=images.accept(input,context,result,verdict);
  if(Boolean.TRUE.equals(result.get("pendingParts")))return Map.of("verdict","APPROVE","pendingImageParts",true,"needsEnrichment",result.get("needsEnrichment"));
  var reviewedProduct=new LinkedHashMap<>(map(product.get("data")));reviewedProduct.remove("images");
  var assignments=maps(result.get("assignments"));require(assignments.size()<=300,"캐릭터 연결 수 초과");
  for(var assignment:assignments){if(!"CONFIRMED".equals(assignment.get("status")))continue;
   UUID work=identities.subject(map(assignment.get("work")),"WORK",null,verdict);UUID character=identities.subject(map(assignment.get("character")),"CHARACTER",work,verdict);confirmed.add(character);
   String source=InterestRules.url(text(assignment.get("evidenceUrl"))),evidence=InterestRules.text(text(assignment.get("evidence")),1000,true);
   db.update("insert into collection_product_subject(product_id,subject_id,verdict_id,evidence_url,evidence) values(?,?,?,?,?) on conflict(product_id,subject_id) do update set verdict_id=excluded.verdict_id,evidence_url=excluded.evidence_url,evidence=excluded.evidence,active=true",productId,character,verdict,source,evidence);
   if(product.get("legacyProductId")!=null){long legacy=number(product.get("legacyProductId"));var parent=db.queryForList("select p.event_id,p.id from subculture_catalog_product g join subculture_participant p on p.id=g.participant_id where g.id=? and p.review_state<>'EXCLUDED'",legacy);require(!parent.isEmpty(),"상품 소속을 확인할 수 없습니다.");long eid=number(parent.getFirst().get("event_id")),pid=number(parent.getFirst().get("id"));var pub=publication.findPublicDetail(eid);if(pub.isPresent()&&maps(pub.get().get("participants")).stream().anyMatch(x->number(x.get("id"))==pid&&maps(x.get("productRows")).stream().anyMatch(g->g.get("id")!=null&&number(g.get("id"))==legacy&&sameProduct(map(g.get("data")),reviewedProduct)))){
     db.update("insert into subculture_subject_link(id,subject_id,kind,target_id,event_id,participant_id,source_url,evidence,system_verdict_id,target_snapshot_json) values(?,?,'PRODUCT',?,?,?,?,?,?,cast(? as jsonb)) on conflict(subject_id,kind,target_id) do update set source_url=excluded.source_url,evidence=excluded.evidence,system_verdict_id=excluded.system_verdict_id,active=true,revision=subculture_subject_link.revision+1,target_snapshot_json=excluded.target_snapshot_json,reviewed_at=now() where subculture_subject_link.reviewed_by is null",UUID.randomUUID(),character,legacy,eid,pid,source,evidence,verdict,encode(reviewedProduct));
    }}
   var owners=db.queryForList("select exhibitor_id from collection_product where id=? and exhibitor_id is not null",productId);
   if(!owners.isEmpty())db.update("insert into subculture_subject_link(id,subject_id,kind,target_id,source_url,evidence,system_verdict_id) values(?,?,'CREATOR',?,?,?,?) on conflict(subject_id,kind,target_id) do update set source_url=excluded.source_url,evidence=excluded.evidence,system_verdict_id=excluded.system_verdict_id,active=true,revision=subculture_subject_link.revision+1,reviewed_at=now() where subculture_subject_link.reviewed_by is null",UUID.randomUUID(),character,owners.getFirst().get("exhibitor_id"),source,evidence,verdict);
   count++;
  }
  boolean complete=((List<?>)result.getOrDefault("unresolved",List.of())).isEmpty()&&assignments.stream().allMatch(a->"CONFIRMED".equals(a.get("status")));
  if(complete){for(var old:db.queryForList("select subject_id from collection_product_subject where product_id=? and active",productId))if(!confirmed.contains(old.get("subject_id"))){
   db.update("update collection_product_subject set active=false where product_id=? and subject_id=?",productId,old.get("subject_id"));
   if(product.get("legacyProductId")!=null)db.update("update subculture_subject_link set active=false,revision=revision+1 where kind='PRODUCT' and target_id=? and subject_id=? and reviewed_by is null",product.get("legacyProductId"),old.get("subject_id"));
  }retireUnsupportedCreatorLinks(productId);}
  if(complete)images.finish(input);
  return Map.of("verdict","APPROVE","productId",productId,"linkedCharacters",count,"needsEnrichment",!((List<?>)result.getOrDefault("unresolved",List.of())).isEmpty()||assignments.stream().anyMatch(a->!"CONFIRMED".equals(a.get("status"))),"unresolved",result.getOrDefault("unresolved",List.of()));
 }
 private void retireAttributions(UUID product){db.update("update collection_product_subject set active=false where product_id=?",product);retireUnsupportedCreatorLinks(product);}
 private void retireUnsupportedCreatorLinks(UUID product){db.update("update subculture_subject_link l set active=false,revision=revision+1 where l.kind='CREATOR' and l.reviewed_by is null and l.active and l.target_id=(select exhibitor_id from collection_product where id=?) and not exists(select 1 from collection_product p join collection_product_subject s on s.product_id=p.id where p.exhibitor_id=l.target_id and p.active and s.active and s.subject_id=l.subject_id)",product);}
 private static boolean sameProduct(Map<String,Object> current,Map<String,Object> reviewed){var safe=new LinkedHashMap<>(current);safe.remove("images");return sorted(safe).equals(sorted(reviewed));}
 private void checkOverrides(Map<String,Object> overrides,Map<String,Object> candidate){for(var entry:overrides.entrySet())require(Objects.equals(sorted(entry.getValue()),sorted(candidate.get(entry.getKey()))),"기존 수정값과 새 원문 결과가 다릅니다. 수정값을 확인하는 보완이 필요합니다.");}
 private void publish(long id){var rows=db.queryForList("select revision from subculture_event_candidate where id=? and review_state='REVIEWED' and not publication_withdrawn",id);if(!rows.isEmpty())publication.publish(id,new PublishInput(number(rows.getFirst().get("revision"))));}
 private void downstream(long participant,boolean baseline,String generation,Consumer<Seed> enqueue){enqueue.accept(new Seed("SALES",Long.toString(participant),Map.of(),baseline,generation));for(var c:db.queryForList("select exhibitor_id from subculture_participant_member where participant_id=?",participant))enqueue.accept(new Seed("CREATOR",text(c.get("exhibitor_id")),Map.of(),baseline,generation));products(participant,baseline,generation,enqueue);}
 private void products(long participant,boolean baseline,String generation,Consumer<Seed> enqueue){
  var view=catalog.participant(participant);if(view.sales()==null)return;
  for(var row:view.sales().productRows()){
   if(row.id()==null)continue;String encoded=encode(row.data());
   var previous=db.queryForList("select id,data_json from collection_product where legacy_product_id=? for update",row.id());
   if(!previous.isEmpty()&&!sorted(decode(previous.getFirst().get("data_json"))).equals(sorted(as(row.data(),Map.class)))){
    // A prior character attribution must not silently follow a changed sale row.
    db.update("update collection_product_subject set active=false where product_id=?",previous.getFirst().get("id"));
    db.update("update subculture_subject_link set active=false,revision=revision+1 where kind='PRODUCT' and target_id=? and reviewed_by is null",row.id());
   }
   var ids=db.queryForList("insert into collection_product(id,legacy_product_id,identity_key,data_json) values(?,?,?,cast(? as jsonb)) on conflict(legacy_product_id) do update set data_json=excluded.data_json,revision=collection_product.revision+case when collection_product.data_json=excluded.data_json then 0 else 1 end returning id",UUID.randomUUID(),row.id(),"legacy:"+row.id(),encoded);
   enqueue.accept(new Seed("CHARACTERS",text(ids.getFirst().get("id")),Map.of(),baseline,generation+":"+CollectionRules.sha(encoded)));
  }
 }
}
