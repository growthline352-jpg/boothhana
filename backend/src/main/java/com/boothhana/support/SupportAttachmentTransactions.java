package com.boothhana.support;

import com.boothhana.api.ApiException;
import com.boothhana.upload.ImageUploadRules;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static com.boothhana.support.SupportModels.*;

/** Short database-only phases. PENDING reserves a quota slot and immutable upload identity;
 * only STORED rows are readable by users. No stream or remote storage call in this service. */
@Service
public class SupportAttachmentTransactions {
    public record Entry(String key,String type,long size,String sha256,boolean stored) {}
    private final SupportService support;
    public SupportAttachmentTransactions(SupportService support){this.support=support;}
    private void validate(AttachmentInput i) {
        if(i==null||i.uploadId()==null||i.size()<1||i.size()>5_242_880||i.contentType()==null||
            !Set.of("image/png","image/jpeg","image/webp").contains(i.contentType())||i.sha256()==null||!i.sha256().matches("[0-9a-f]{64}"))
            throw ApiException.badRequest("5MiB 이하 PNG/JPG/WebP와 올바른 파일 검증값이 필요합니다.");
    }
    private Map<String,Object> owner(UUID ticket,Principal actor) {
        var t=support.row(ticket,true);support.access(t,actor);
        if(actor.guest()||actor.userId()==null||!Objects.equals(actor.userId(),t.get("requester_id")))
            throw ApiException.forbidden("첨부는 로그인한 접수 작성자만 추가할 수 있습니다.");
        return t;
    }
    private void lock(UUID id) {
        support.database().execute("set local lock_timeout='5s'");
        support.database().queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","support-upload:"+id);
    }
    private Entry entry(Map<String,Object> r) {return new Entry(r.get("object_key").toString(),r.get("content_type").toString(),SupportService.n(r,"byte_size"),r.get("sha256").toString(),"STORED".equals(r.get("state")));}
    private void same(Map<String,Object> r,UUID ticket,AttachmentInput i) {
        if(!ticket.equals(r.get("ticket_id"))||!i.sha256().equals(r.get("sha256"))||!i.contentType().equals(r.get("content_type"))||i.size()!=SupportService.n(r,"byte_size"))
            throw ApiException.conflict("다른 파일에 같은 업로드 ID를 사용할 수 없습니다.");
    }
    @Transactional(timeout=10)
    public Entry prepare(UUID ticket,AttachmentInput i,Principal actor) {
        validate(i);lock(i.uploadId());var t=owner(ticket,actor);
        var old=support.database().queryForList("select * from support_attachment where id=?",i.uploadId());
        if(!old.isEmpty()){same(old.getFirst(),ticket,i);if("STORED".equals(old.getFirst().get("state")))return entry(old.getFirst());}
        if(Set.of("CLOSED","RESOLVED").contains(t.get("status")))throw ApiException.conflict("종료된 접수입니다. 추가 질문 후 첨부해 주세요.");
        if(!old.isEmpty())return entry(old.getFirst());
        long count=Objects.requireNonNull(support.database().queryForObject("select count(*) from support_attachment where ticket_id=?",Long.class,ticket));
        if(count>=5)throw ApiException.badRequest("접수당 최대 5개 파일입니다. 실패한 파일은 같은 업로드로 재시도해 주세요.");
        String key="support/"+ticket+"/"+i.uploadId()+"/"+i.sha256()+ImageUploadRules.extension(i.contentType());
        support.database().update("insert into support_attachment(id,ticket_id,owner_id,content_type,byte_size,sha256,object_key,state) values(?,?,?,?,?,?,?,'PENDING')",i.uploadId(),ticket,actor.userId(),i.contentType(),i.size(),i.sha256(),key);
        return new Entry(key,i.contentType(),i.size(),i.sha256(),false);
    }
    @Transactional(timeout=10)
    public Map<String,Object> complete(UUID ticket,AttachmentInput i,Principal actor) {
        validate(i);lock(i.uploadId());var t=owner(ticket,actor);
        var rows=support.database().queryForList("select * from support_attachment where id=?",i.uploadId());
        if(rows.isEmpty())throw ApiException.conflict("업로드 예약이 변경되었습니다. 첨부 내역을 확인해 주세요.");
        var row=rows.getFirst();same(row,ticket,i);
        if("STORED".equals(row.get("state")))return Map.of("id",i.uploadId().toString(),"state","STORED");
        if(Set.of("CLOSED","RESOLVED").contains(t.get("status")))throw ApiException.conflict("전송 중 접수가 종료되었습니다. 공개하지 않은 파일은 운영 정리 대상으로 남습니다.");
        support.database().update("update support_attachment set state='STORED' where id=? and state='PENDING'",i.uploadId());
        support.audit(ticket,actor.userId(),"ATTACHMENT_ADDED",Map.of("attachmentId",i.uploadId().toString(),"previousStatus",t.get("status"),"newStatus","OPEN"));
        support.database().update("update support_ticket set status='OPEN',resolution=null,resolved_at=null,verified_result_json=null,revision=revision+1,updated_at=now() where id=?",ticket);
        return Map.of("id",i.uploadId().toString(),"state","STORED");
    }
    @Transactional(timeout=10)
    public void abandonPending(UUID ticket,UUID upload,Principal actor) {
        lock(upload);owner(ticket,actor);
        // Retrying an in-flight abandoned upload cannot finalize; any uploaded bytes stay private.
        support.database().update("delete from support_attachment where id=? and ticket_id=? and state='PENDING'",upload,ticket);
    }
    @Transactional(readOnly=true,timeout=10)
    public Entry describe(UUID ticket,UUID attachment,Principal actor) {
        var t=support.row(ticket,false);support.access(t,actor);if(actor.guest())throw ApiException.forbidden("비회원 첨부 없음");
        var rows=support.database().queryForList("select * from support_attachment where id=? and ticket_id=? and state='STORED'",attachment,ticket);
        if(rows.isEmpty())throw ApiException.notFound("첨부 없음");return entry(rows.getFirst());
    }
}
