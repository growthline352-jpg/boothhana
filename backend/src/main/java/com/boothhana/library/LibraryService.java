package com.boothhana.library;

import com.boothhana.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.boothhana.library.LibraryModels.*;

@Service
@Transactional(readOnly=true)
public class LibraryService {
    private final JdbcTemplate db; private final JsonMapper json; private final LibraryTargets targets;
    public LibraryService(JdbcTemplate db,JsonMapper json,LibraryTargets targets){this.db=db;this.json=json;this.targets=targets;}
    private void lock(long owner){db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","memory-owner:"+owner);}
    private static Target checked(Target t){try{return LibraryRules.target(t);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}}
    private static String day(String v){try{return LibraryRules.day(v);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}}
    private static String note(String v){try{return LibraryRules.note(v);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}}
    private static String hall(String v){try{return LibraryRules.hall(v);}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}}
    private static void validatePlan(Current current,String planned){if(!LibraryRules.operatingDay(current,planned))throw ApiException.badRequest("공개된 실제 운영일 중에서 방문일을 선택해 주세요.");}
    public List<Resolved> resolve(List<Target> values){if(values==null||values.isEmpty()||values.size()>200)throw ApiException.badRequest("한 번에 1~200개 대상을 확인할 수 있어요.");return targets.resolveAll(values.stream().map(LibraryService::checked).toList());}
    @Transactional public SaveResult save(long owner,Save input){return saveInternal(owner,input,"");}
    private SaveResult saveInternal(long owner,Save input,String initialNote){if(input==null)throw ApiException.badRequest("저장 대상을 선택해 주세요.");Target t=checked(input.target());String planned=day(input.day()),h=hall(input.hall());lock(owner);
        var found=db.queryForList("select id,participant_id from memory_item where user_id=? and event_id=? and target_type=? and target_id=?",owner,t.eventId(),t.type(),t.id());
        // Replays preserve the FIRST save, note and planned context. No arbitrary last-write-wins import.
        if(!found.isEmpty()){var existing=found.getFirst();Long parent=existing.get("participant_id")==null?null:((Number)existing.get("participant_id")).longValue();if(!Objects.equals(parent,t.participantId()))throw ApiException.badRequest("저장 대상의 소속 부스가 다릅니다.");return new SaveResult(false,detail(owner,UUID.fromString(existing.get("id").toString())));}
        var live=targets.resolve(t);if(!live.available())throw ApiException.notFound("현재 공개되지 않은 정보는 새로 저장할 수 없어요.");validatePlan(live.current(),planned);
        if(db.queryForObject("select count(*) from memory_item where user_id=?",Long.class,owner)>=LibraryRules.MAX_ITEMS)throw ApiException.conflict("보관함은 최대 500개까지 저장할 수 있어요. 필요 없는 항목을 정리해 주세요.");
        UUID id=UUID.randomUUID();
        db.update("""
          insert into memory_item(id,user_id,event_id,target_type,target_id,participant_id,saved_json,planned_day,hall,note)
          values(?,?,?,?,?,?,cast(? as jsonb),nullif(?,'')::date,?,?)
          """,id,owner,t.eventId(),t.type(),t.id(),t.participantId(),json.writeValueAsString(live.current().memory()),planned,h,initialNote);
        return new SaveResult(true,detail(owner,id));
    }
    @Transactional public ImportResult importItem(long owner,Import input){if(input==null)throw ApiException.badRequest("가져올 정보가 필요합니다.");if(input.expectedUserId()!=owner)throw ApiException.conflict("로그인 계정이 변경됐어요. 가져올 계정을 확인한 뒤 다시 시도해 주세요.");String n=note(input.note());var saved=saveInternal(owner,input.item(),n);
        // Never overwrite a server note/visit with a shared-device draft, even during repeated imports.
        String result=saved.created()?"IMPORTED":!n.isEmpty()&&!Objects.equals(n,saved.item().note())?"NOTE_CONFLICT":
            (!day(input.item().day()).isEmpty()&&!day(input.item().day()).equals(saved.item().day()))||(!hall(input.item().hall()).isEmpty()&&!hall(input.item().hall()).equals(saved.item().hall()))?"CONTEXT_CONFLICT":"ALREADY_SAVED";
        return new ImportResult(result,saved.item());
    }
    public List<Index> index(long owner){var visits=visits(owner);return db.queryForList("select id,event_id,target_type,target_id,participant_id,revision,planned_day,hall from memory_item where user_id=? order by saved_at desc,id",owner).stream().map(r->{Target t=target(r);return new Index(UUID.fromString(r.get("id").toString()),t,num(r,"revision"),LibraryRules.str(r.get("planned_day")),LibraryRules.str(r.get("hall")),visits.getOrDefault(context(t),List.of()));}).toList();}
    public Page list(long owner,String q,Long eventId,String kind,boolean visitedOnly,int page,int size){if(q==null)q="";if(q.length()>100||page<0||page>10000||size<1||size>50||eventId!=null&&eventId<1||kind!=null&&!kind.isBlank()&&!Set.of("EVENT","PARTICIPANT","PRODUCT").contains(kind))throw ApiException.badRequest("검색 조건을 확인해 주세요.");
        var visits=visits(owner);List<Entry> all=targets.rows(owner).stream().map(r->entry(r,visits,false)).toList();
        Map<Long,Group> grouped=new LinkedHashMap<>();for(Entry e:all){String title=e.available()?e.current().memory().eventName():"현재 공개되지 않는 행사";var old=grouped.get(e.target().eventId());if(old!=null&&e.available()==false)title=old.name();grouped.put(e.target().eventId(),new Group(e.target().eventId(),title,old==null?1:old.count()+1));}
        final String search=q,type=kind;var filtered=all.stream().filter(e->eventId==null||e.target().eventId()==eventId).filter(e->type==null||type.isBlank()||type.equals(e.target().type())).filter(e->!visitedOnly||!e.visitedDays().isEmpty()).filter(e->LibraryRules.matches(search,e)).toList();
        int start=Math.min(filtered.size(),page*size),end=Math.min(filtered.size(),start+size);var pageEntries=filtered.subList(start,end);var images=targets.images(pageEntries.stream().filter(Entry::available).map(Entry::target).toList());List<Entry> items=pageEntries.stream().map(e->withImage(e,images.get(e.target()))).toList();
        return new Page(items,page,size,filtered.size(),List.copyOf(grouped.values()));
    }
    public Entry detail(long owner,UUID id){var rows=db.queryForList("select m.*, "+LibraryTargets.COLUMNS+" from memory_item m "+LibraryTargets.JOINS+" where m.user_id=? and m.id=?",owner,id);if(rows.isEmpty())throw ApiException.notFound("보관한 항목을 찾을 수 없어요.");return entry(rows.getFirst(),visits(owner),true);}
    @Transactional public Entry edit(long owner,UUID id,Edit input){if(input==null||input.revision()<0)throw ApiException.badRequest("수정 정보를 확인해 주세요.");String n=note(input.note()),d=day(input.day()),h=hall(input.hall());lock(owner);Entry current=detail(owner,id);
        if(current.revision()!=input.revision())throw ApiException.conflict("다른 화면에서 수정됐어요. 현재 내용을 확인한 뒤 다시 저장해 주세요.");
        // Existing historical plans are retained when schedules change. Only a NEW choice needs validation.
        if(!d.equals(current.day())&&!d.isEmpty()){if(!current.available())throw ApiException.conflict("비공개 정보의 새 방문일은 지정할 수 없어요.");validatePlan(current.current(),d);}
        if(!Objects.equals(n,current.note())||!Objects.equals(d,current.day())||!Objects.equals(h,current.hall()))db.update("update memory_item set note=?,planned_day=nullif(?,'')::date,hall=?,revision=revision+1,updated_at=now() where user_id=? and id=?",n,d,h,owner,id);
        return detail(owner,id);
    }
    @Transactional public void delete(long owner,UUID id,long revision){if(revision<0)throw ApiException.badRequest("수정 버전을 확인해 주세요.");lock(owner);var rows=db.queryForList("select * from memory_item where user_id=? and id=?",owner,id);if(rows.isEmpty())return;var r=rows.getFirst();if(num(r,"revision")!=revision)throw ApiException.conflict("다른 화면에서 수정됐어요. 다시 확인한 뒤 삭제해 주세요.");Target t=target(r);
        db.update("delete from memory_item where user_id=? and id=?",owner,id);
        // Keep a shared booth visit while ANY product/booth memory still refers to it.
        if(db.queryForObject("select count(*) from memory_item where user_id=? and event_id=? and coalesce(participant_id,0)=?",Long.class,owner,t.eventId(),LibraryRules.participant(t))==0)
            db.update("delete from memory_visit where user_id=? and event_id=? and participant_id=?",owner,t.eventId(),LibraryRules.participant(t));
    }
    @Transactional public Entry visit(long owner,UUID id,Visit input){if(input==null)throw ApiException.badRequest("방문 날짜가 필요합니다.");String d;try{d=LibraryRules.visitDay(input.day(),LocalDate.now(ZoneId.of("Asia/Seoul")));}catch(IllegalArgumentException e){throw ApiException.badRequest(e.getMessage());}lock(owner);Entry item=detail(owner,id);Target t=item.target();
        if(input.visited()&&!item.visitedDays().contains(d)){if(!item.available())throw ApiException.conflict("현재 공개 정보를 확인할 수 없어 새 방문 표시는 남길 수 없어요.");validatePlan(item.current(),d);
            if(!"EVENT".equals(t.type())&&!participantOn(item.current().locations(),d))throw ApiException.badRequest("해당 날짜에 참가하지 않는 것으로 안내된 부스입니다.");}
        if(input.visited())db.update("insert into memory_visit(user_id,event_id,participant_id,visited_day) values(?,?,?,cast(? as date)) on conflict do nothing",owner,t.eventId(),LibraryRules.participant(t),d);
        else db.update("delete from memory_visit where user_id=? and event_id=? and participant_id=? and visited_day=cast(? as date)",owner,t.eventId(),LibraryRules.participant(t),d);
        return detail(owner,id);
    }
    static boolean participantOn(List<Map<String,Object>> locations,String day){if(locations.isEmpty())return true;return locations.stream().anyMatch(l->l.get("startDate")==null||l.get("endDate")==null||(LibraryRules.str(l.get("startDate")).compareTo(day)<=0&&LibraryRules.str(l.get("endDate")).compareTo(day)>=0));}
    @Transactional public void activity(long owner,UUID id,String action){if(!Set.of("OPEN","OUTBOUND").contains(action==null?"":action))throw ApiException.badRequest("동작을 확인해 주세요.");if("OPEN".equals(action))db.update("update memory_item set last_opened_at=now(),open_count=least(open_count+1,1000000) where user_id=? and id=?",owner,id);else db.update("update memory_item set outbound_count=least(outbound_count+1,1000000) where user_id=? and id=?",owner,id);}
    private Map<String,List<String>> visits(long owner){Map<String,List<String>> result=new HashMap<>();for(var r:db.queryForList("select event_id,participant_id,visited_day from memory_visit where user_id=? order by visited_day",owner))result.computeIfAbsent(num(r,"event_id")+":"+num(r,"participant_id"),k->new ArrayList<>()).add(r.get("visited_day").toString());return result;}
    private Entry entry(Map<String,Object> row,Map<String,List<String>> visits,boolean image){Target t=target(row);var live=targets.project(t,row);Memory remembered=live.available()?json.readValue(row.get("saved_json").toString(),Memory.class):null;
        Memory saved=remembered;
        // A booth can remain public while its separately reviewed sales are hidden.
        // Historical sales summaries/tags must not leak through saved/search projections.
        // Keep the private note/plan and original public identity; do not mutate DB history.
        if(remembered!=null&&"PARTICIPANT".equals(t.type())&&targets.object(row.get("live_sales")).isEmpty())
            saved=new Memory(remembered.title(),remembered.eventName(),remembered.participantName(),"",live.current().memory().tags());
        return new Entry(UUID.fromString(row.get("id").toString()),t,num(row,"revision"),LibraryTargets.stamp(row.get("saved_at")),LibraryTargets.stamp(row.get("updated_at")),LibraryRules.str(row.get("planned_day")),LibraryRules.str(row.get("hall")),LibraryRules.str(row.get("note")),visits.getOrDefault(context(t),List.of()),live.available(),saved,live.current(),live.available()&&image?targets.image(t):null,live.available()&&!Objects.equals(remembered,live.current().memory()),LibraryTargets.stamp(row.get("last_opened_at")));
    }
    private Entry withImage(Entry e,Image image){return !e.available()?e:new Entry(e.id(),e.target(),e.revision(),e.savedAt(),e.updatedAt(),e.day(),e.hall(),e.note(),e.visitedDays(),true,e.saved(),e.current(),image,e.changed(),e.lastOpenedAt());}
    private static Target target(Map<String,Object> r){return new Target(r.get("target_type").toString(),num(r,"event_id"),num(r,"target_id"),r.get("participant_id")==null?null:num(r,"participant_id"));}
    private static long num(Map<String,Object> m,String k){return ((Number)m.get(k)).longValue();}
    private static String context(Target t){return t.eventId()+":"+LibraryRules.participant(t);}
}
