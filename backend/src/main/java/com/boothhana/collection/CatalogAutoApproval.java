package com.boothhana.collection;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;

/** Intake policy: validate, approve effective facts, publish. Manual exclusions and withdrawals survive. */
@Service
@Transactional(readOnly=true)
public class CatalogAutoApproval {
    private final JdbcTemplate db;private final JsonMapper json;
    private final CatalogPublicationService publications;private final boolean enabled;
    private final CatalogMediaService media;
    static final String NOTE="수집 데이터 자동 승인 정책 적용";
    public CatalogAutoApproval(JdbcTemplate db,JsonMapper json,CatalogPublicationService publications,CatalogMediaService media,
        @Value("${app.collection.auto-approve:true}") boolean enabled){this.db=db;this.json=json;this.publications=publications;this.media=media;this.enabled=enabled;}
    public boolean enabled(){return enabled;}
    public void lock(){if(enabled)publications.lockForPublication();}
    public List<Long> pending(int limit,long afterId){
        if(limit<1||limit>200||afterId<0)throw com.boothhana.api.ApiException.badRequest("자동 승인 조회 범위 오류");
        if(!enabled)return List.of();
        return db.query("""
            select e.id from subculture_event_candidate e left join subculture_catalog_publication pub on pub.event_id=e.id
            where e.id>? and e.review_state<>'EXCLUDED' and not e.publication_withdrawn and (
              e.review_state='PENDING' or pub.event_id is null or pub.event_revision<>e.revision
              or exists(select 1 from subculture_participant p where p.event_id=e.id and p.review_state='PENDING')
              or exists(select 1 from subculture_sales s join subculture_participant p on p.id=s.participant_id
                where p.event_id=e.id and p.review_state<>'EXCLUDED' and s.review_state='PENDING')
              or exists(select 1 from subculture_catalog_asset a left join subculture_participant p on p.id=a.participant_id
                where a.event_id=e.id and a.rights_state='PENDING' and (p.id is null or p.review_state<>'EXCLUDED')
                  and (a.type<>'BANNER' or a.participant_id is not null or exists(
                    select 1 from jsonb_array_elements(case when jsonb_typeof((e.payload_json || e.overrides_json)->'banners')='array'
                      then (e.payload_json || e.overrides_json)->'banners' else '[]'::jsonb end) b
                    where b->>'matchesEdition'='true' and b->>'imageUrl'=a.image_url and b->>'pageUrl'=a.page_url))))
            order by e.id limit ?
            """,(r,n)->r.getLong(1),afterId,limit);
    }
    @Transactional(timeout=60)
    public Map<String,Object> approve(long eventId){
        if(!enabled)return Map.of("id",eventId,"enabled",false);
        lock();
        var rows=db.queryForList("select * from subculture_event_candidate where id=? for update",eventId);
        if(rows.isEmpty())throw com.boothhana.api.ApiException.notFound("행사 없음");var row=rows.getFirst();
        if("EXCLUDED".equals(row.get("review_state")))return Map.of("id",eventId,"excluded",true);
        if(Boolean.TRUE.equals(row.get("publication_withdrawn")))return Map.of("id",eventId,"withdrawn",true);
        @SuppressWarnings("unchecked") Map<String,Object> effective=json.readValue(row.get("payload_json").toString(),Map.class);
        effective.putAll(json.readValue(row.get("overrides_json").toString(),Map.class));
        EventData event=json.readValue(json.writeValueAsString(effective),EventData.class);
        String start=event.occurrences().stream().map(Occurrence::startDate).min(String::compareTo).orElseThrow();
        String end=event.occurrences().stream().map(Occurrence::endDate).max(String::compareTo).orElseThrow();
        if(!CollectionRules.event(event,new Scope("SEOUL_GYEONGGI","Asia/Seoul",start,end)).accepted())
            throw com.boothhana.api.ApiException.badRequest("검증을 통과하지 못한 행사는 승인할 수 없습니다.");
        int changes=db.update("""
            update subculture_event_candidate set review_state='REVIEWED',reviewed_payload_json=payload_json || overrides_json,
              review_note=?,reviewed_at=now(),revision=revision+1 where id=? and (review_state='PENDING' or reviewed_payload_json is null)
            """,NOTE,eventId);
        changes+=db.update("""
            update subculture_participant set review_state='REVIEWED',reviewed_payload_json=payload_json || overrides_json,
              review_note=?,revision=revision+1 where event_id=? and review_state='PENDING'
            """,NOTE,eventId);
        changes+=db.update("""
            update subculture_sales s set review_state='REVIEWED',reviewed_payload_json=s.payload_json || s.overrides_json,
              reviewed_product_checks_json=s.product_checks_json,review_note=?,revision=s.revision+1
            from subculture_participant p where p.id=s.participant_id and p.event_id=?
              and p.review_state<>'EXCLUDED' and s.review_state='PENDING'
            """,NOTE,eventId);
        if(event.banners()!=null)for(var banner:event.banners())if(Boolean.TRUE.equals(banner.matchesEdition()))
            media.register(eventId,null,null,new Image("BANNER",banner.imageUrl(),banner.pageUrl(),banner.rightsEvidence(),event.name()));
        db.update("""
            update subculture_catalog_asset a set rights_state='APPROVED',rights_note=?,
              credit=case when credit='' then page_url else credit end,revision=a.revision+1
            where a.event_id=? and a.rights_state='PENDING'
              and (a.participant_id is null or exists(select 1 from subculture_participant p where p.id=a.participant_id and p.review_state<>'EXCLUDED'))
              and (a.type<>'BANNER' or a.participant_id is not null or exists(
                select 1 from jsonb_array_elements(cast(? as jsonb)) b
                where b->>'matchesEdition'='true' and b->>'imageUrl'=a.image_url and b->>'pageUrl'=a.page_url))
            """,NOTE,eventId,json.writeValueAsString(event.banners()==null?List.of():event.banners()));
        long revision=db.queryForObject("select revision from subculture_event_candidate where id=?",Long.class,eventId);
        var published=db.queryForList("select event_revision from subculture_catalog_publication where event_id=?",eventId);
        if(changes==0&&!published.isEmpty()&&((Number)published.getFirst().get("event_revision")).longValue()==revision)
            return Map.of("id",eventId,"published",true,"unchanged",true);
        return publications.publish(eventId,new PublishInput(revision));
    }
}
