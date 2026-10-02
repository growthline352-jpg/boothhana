package com.boothhana.collection;

import com.boothhana.api.ApiException;
import com.boothhana.security.CurrentUser;
import com.boothhana.support.SupportRateLimiter;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
public class EventComments {
    private static final long DFESTA_MAIN_ID=1L, DFESTA_SUNDAY_ID=7L;
    private final JdbcTemplate db;
    private final CatalogPublicationService publications;
    private final CurrentUser current;
    private final SupportRateLimiter limits;
    public EventComments(JdbcTemplate db, CatalogPublicationService publications, CurrentUser current, SupportRateLimiter limits) {
        this.db=db; this.publications=publications; this.current=current; this.limits=limits;
    }
    public record Input(UUID requestId, String body) {}
    @GetMapping("/api/admin/event-comments")
    public Map<String,Object> adminList(Authentication auth,@RequestParam(defaultValue="0") int page) {
        current.require(auth);
        if(auth.getAuthorities().stream().noneMatch(a->a.getAuthority().equals("ROLE_ADMIN"))) throw ApiException.forbidden("관리자 권한이 필요합니다.");
        if(page<0||page>10000) throw ApiException.badRequest("페이지를 확인해 주세요.");
        var items=db.queryForList("select c.id,c.event_id as \"eventId\",e.name as \"eventName\",u.display_name as \"authorName\",c.body,c.created_at as \"createdAt\" from event_comment c join app_user u on u.id=c.user_id join subculture_event_candidate e on e.id=c.event_id where c.deleted=false order by c.created_at desc,c.id desc limit 20 offset ?",page*20);
        return Map.of("items",items,"total",db.queryForObject("select count(*) from event_comment where deleted=false",Long.class));
    }
    public static String validate(Input input) {
        if(input==null || input.requestId()==null || input.body()==null) throw ApiException.badRequest("댓글 내용을 입력해 주세요.");
        String body=input.body().strip();
        if(body.isEmpty() || body.length()>2000 || body.indexOf('\0')>=0) throw ApiException.badRequest("댓글은 1~2,000자로 입력해 주세요.");
        if(CommentLanguageFilter.containsBlockedTerm(body)) throw ApiException.badRequest("댓글을 등록하지 못했습니다.");
        return body;
    }
    private Map<String,Object> visible(long eventId) {
        return publications.findPublicDetail(eventId).orElseThrow(()->ApiException.notFound("공개된 행사를 찾을 수 없습니다."));
    }
    private long secondReviewEventId(long eventId) {
        if(eventId!=DFESTA_MAIN_ID) return eventId;
        // This edition was collected as two day-specific events. Merge reviews only while both
        // original publications are public and still identify the same edition.
        var names=db.queryForList("select p.snapshot_json->'event'->>'name' from subculture_catalog_publication p join subculture_event_candidate e on e.id=p.event_id where p.event_id in (?,?) and e.review_state<>'EXCLUDED'",String.class,DFESTA_MAIN_ID,DFESTA_SUNDAY_ID);
        return names.size()==2 && names.stream().allMatch(name->name!=null && name.matches("^제35회 디\\.\\s*페스타.*")) ? DFESTA_SUNDAY_ID : eventId;
    }
    @GetMapping("/api/public/catalog/events/{eventId}/comments")
    public Map<String,Object> list(@PathVariable long eventId, @RequestParam(defaultValue="0") int page) {
        var detail=visible(eventId);
        if(page<0 || page>10000) throw ApiException.badRequest("페이지를 확인해 주세요.");
        if(detail.get("operatingGroup") instanceof CatalogOperatingGroups.PublicGroup group){
            var ids=group.members().stream().map(CatalogOperatingGroups.Member::eventId).toList();
            String marks=String.join(",",Collections.nCopies(ids.size(),"?"));List<Object> args=new ArrayList<>(ids);args.add(page*20);
            var items=db.queryForList("select c.id,c.event_id as \"eventId\",c.user_id as \"authorId\",u.display_name as \"authorName\",c.body,c.created_at as \"createdAt\" from event_comment c join app_user u on u.id=c.user_id where c.event_id in ("+marks+") and c.deleted=false order by c.created_at desc,c.id desc limit 20 offset ?",args.toArray());
            return Map.of("items",items,"total",db.queryForObject("select count(*) from event_comment where event_id in ("+marks+") and deleted=false",Long.class,ids.toArray()),"page",page,"size",20);
        }
        long secondEventId=secondReviewEventId(eventId);
        var items=db.queryForList("select c.id,c.event_id as \"eventId\",c.user_id as \"authorId\",u.display_name as \"authorName\",c.body,c.created_at as \"createdAt\" from event_comment c join app_user u on u.id=c.user_id where c.event_id in (?,?) and c.deleted=false order by c.created_at desc,c.id desc limit 20 offset ?",eventId,secondEventId,page*20);
        return Map.of("items",items,"total",db.queryForObject("select count(*) from event_comment where event_id in (?,?) and deleted=false",Long.class,eventId,secondEventId),"page",page,"size",20);
    }
    @PostMapping("/api/me/catalog/events/{eventId}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String,Object> create(Authentication auth,@PathVariable long eventId,@RequestBody Input input) {
        long userId=current.require(auth).id;
        String body=validate(input); visible(eventId);
        if(limits.hit("event-comment:"+userId)>30) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"RATE_LIMITED","댓글은 한 시간에 30개까지 작성할 수 있어요.");
        db.update("insert into event_comment(id,event_id,user_id,body) values(?,?,?,?) on conflict(id) do nothing",input.requestId(),eventId,userId,body);
        var saved=db.queryForMap("select event_id,user_id,body,deleted from event_comment where id=?",input.requestId());
        if(((Number)saved.get("user_id")).longValue()!=userId || ((Number)saved.get("event_id")).longValue()!=eventId || !body.equals(saved.get("body")) || Boolean.TRUE.equals(saved.get("deleted"))) throw ApiException.conflict("요청번호가 이미 사용됐습니다. 새로고침 후 다시 작성해 주세요.");
        return Map.of("id",input.requestId());
    }
    @DeleteMapping("/api/me/catalog/events/{eventId}/comments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(Authentication auth,@PathVariable long eventId,@PathVariable UUID id) {
        long userId=current.require(auth).id;
        boolean admin=auth.getAuthorities().stream().anyMatch(a->a.getAuthority().equals("ROLE_ADMIN"));
        int changed=db.update("update event_comment set deleted=true where id=? and event_id=? and (user_id=? or ?)",id,eventId,userId,admin);
        if(changed==0) throw ApiException.notFound("삭제할 댓글을 찾을 수 없거나 권한이 없습니다.");
    }
}
