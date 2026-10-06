package com.boothhana.itinerary;

import com.boothhana.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import java.nio.charset.StandardCharsets;

/** Account ownership is checked on every SQL read/write; identifiers are never supplied as SQL text. */
@Service
@Transactional(readOnly=true)
public class PrivatePlanStore {
 static final int MAX_PLAN_BYTES=60000;
 static final int MAX_STORED_BYTES=98304;
 public enum Kind {
  ITINERARY("personal_itinerary","id",100), PURCHASE("purchase_plan","event_id",100);
  final String table,key;final int limit;
  Kind(String table,String key,int limit){this.table=table;this.key=key;this.limit=limit;}
 }
 public record Stored(JsonNode plan,long revision,String updatedAt){}
 private final JdbcTemplate db;private final JsonMapper json;
 public PrivatePlanStore(JdbcTemplate db,JsonMapper json){this.db=db;this.json=json;}
 private Stored value(Map<String,Object> row){return new Stored(json.readTree((String)row.get("body")),((Number)row.get("revision")).longValue(),((java.sql.Timestamp)row.get("updated_at")).toInstant().toString());}
 public List<Stored> list(Kind kind,long owner){return db.queryForList("select plan_json::text body,revision,updated_at from "+kind.table+" where user_id=? and not deleted order by updated_at desc,"+kind.key+" limit ?",owner,kind.limit).stream().map(this::value).toList();}
 public Stored read(Kind kind,long owner,Object key){var rows=rows(kind,owner,key);if(rows.isEmpty()||Boolean.TRUE.equals(rows.getFirst().get("deleted")))throw ApiException.notFound("저장한 계획을 찾을 수 없어요.");return value(rows.getFirst());}
 public record PurchaseState(Stored record,long revision){}
 public PurchaseState purchaseState(long owner,long event){var rows=rows(Kind.PURCHASE,owner,event);if(rows.isEmpty())return new PurchaseState(null,0);var row=rows.getFirst();return new PurchaseState(Boolean.TRUE.equals(row.get("deleted"))?null:value(row),((Number)row.get("revision")).longValue());}
 private List<Map<String,Object>> rows(Kind kind,long owner,Object key){return db.queryForList("select plan_json::text body,revision,updated_at,deleted from "+kind.table+" where user_id=? and "+kind.key+"=?",owner,key);}
 private void lock(Kind kind,long owner){db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","private-plan:"+kind.table+":"+owner);}
 @Transactional public Stored save(Kind kind,long owner,Object key,long revision,JsonNode plan){
  if(revision<0)throw ApiException.badRequest("저장 버전을 확인해 주세요.");
  String body=json.writeValueAsString(plan);
  if(body.getBytes(StandardCharsets.UTF_8).length>MAX_PLAN_BYTES||db.queryForObject("select octet_length(cast(? as jsonb)::text)",Integer.class,body)>MAX_STORED_BYTES)throw ApiException.badRequest("기록이 너무 길어요. 물건·장소·메모를 줄인 뒤 저장해 주세요.");
  lock(kind,owner);
  var rows=rows(kind,owner,key);
  if(!rows.isEmpty()){
   var row=rows.getFirst();if(Boolean.TRUE.equals(row.get("deleted"))){
    // A new purchase record for the same event must acknowledge its tombstone.
    // Old in-flight saves cannot recreate it with revision 0 or the old revision.
    if(kind!=Kind.PURCHASE||((Number)row.get("revision")).longValue()!=revision)throw ApiException.notFound("다른 화면에서 삭제한 계획이에요. 다시 열어 새 계획으로 저장해 주세요.");
    if(db.queryForObject("select count(*) from "+kind.table+" where user_id=? and not deleted",Long.class,owner)>=kind.limit)throw ApiException.conflict("최대 100개까지 저장할 수 있어요. 필요 없는 계획을 정리해 주세요.");
    db.update("update "+kind.table+" set plan_json=cast(? as jsonb),deleted=false,revision=revision+1,updated_at=now() where user_id=? and "+kind.key+"=?",body,owner,key);
    return read(kind,owner,key);
   }
   var current=value(row);
   // Match the stored JSON text's numeric node types (e.g. a small Long becomes an IntNode).
   // Identical retry after a lost response is safe; different stale data never overwrites a newer plan.
   if(current.plan().equals(json.readTree(body)))return current;
   if(current.revision()!=revision)throw ApiException.conflict("다른 기기나 화면에서 수정됐어요. 최신 계획을 확인한 뒤 다시 저장해 주세요.");
   db.update("update "+kind.table+" set plan_json=cast(? as jsonb),revision=revision+1,updated_at=now() where user_id=? and "+kind.key+"=?",body,owner,key);
  }else{
   if(revision!=0)throw ApiException.conflict("원래 저장한 계획을 찾을 수 없어요. 최신 목록을 확인해 주세요.");
   if(db.queryForObject("select count(*) from "+kind.table+" where user_id=? and not deleted",Long.class,owner)>=kind.limit)throw ApiException.conflict("최대 100개까지 저장할 수 있어요. 필요 없는 계획을 정리해 주세요.");
   db.update("insert into "+kind.table+"(user_id,"+kind.key+",plan_json) values(?,?,cast(? as jsonb))",owner,key,body);
  }
  return read(kind,owner,key);
 }
 @Transactional public void delete(Kind kind,long owner,Object key,long revision){
  if(revision<1)throw ApiException.badRequest("삭제할 버전을 확인해 주세요.");lock(kind,owner);var rows=rows(kind,owner,key);if(rows.isEmpty()||Boolean.TRUE.equals(rows.getFirst().get("deleted")))return;
  if(value(rows.getFirst()).revision()!=revision)throw ApiException.conflict("다른 화면에서 수정됐어요. 최신 계획을 확인한 뒤 삭제해 주세요.");
  // Keep a tombstone so an old delayed save cannot resurrect a deleted plan.
  db.update("update "+kind.table+" set plan_json='{}'::jsonb,deleted=true,revision=revision+1,updated_at=now() where user_id=? and "+kind.key+"=?",owner,key);
 }
}
