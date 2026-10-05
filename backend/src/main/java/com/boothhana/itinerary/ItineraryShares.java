package com.boothhana.itinerary;

import com.boothhana.api.ApiException;
import com.boothhana.support.SupportRateLimiter;
import com.boothhana.support.SupportRules;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;

@RestController
@RequestMapping("/api/public/itinerary/shares")
public class ItineraryShares {
 public record Create(UUID requestId,String managementKey,JsonNode plan,boolean includeNotes){}
 public record Revoke(String managementKey){}
 private final JdbcTemplate db;private final JsonMapper json;private final SupportRateLimiter limits;
 private static final SecureRandom RANDOM=new SecureRandom();
 public ItineraryShares(JdbcTemplate db,JsonMapper json,SupportRateLimiter limits){this.db=db;this.json=json;this.limits=limits;}
 static String keyHash(String key){if(key==null||!key.matches("[A-Za-z0-9_-]{43}"))throw SharedPlanRules.invalid();return SupportRules.digest(key);}
 private void quota(HttpServletRequest request){if(limits.hit("itinerary-share:peer:"+request.getRemoteAddr())>60||limits.hit("itinerary-share:global")>1000)throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"SHARE_LIMIT","공유 요청이 많아요. 잠시 후 다시 시도해 주세요.");}
 private static String newToken(){byte[] bytes=new byte[16];RANDOM.nextBytes(bytes);return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);}
 private static <T> ResponseEntity<T> response(T body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").header("X-Robots-Tag","noindex, nofollow").body(body);}
 @PostMapping public ResponseEntity<Map<String,Object>> create(@RequestBody Create input,HttpServletRequest request){
  if(input==null||input.requestId()==null)throw SharedPlanRules.invalid();String hash=keyHash(input.managementKey());
  var snapshot=SharedPlanRules.snapshot(input.plan(),input.includeNotes(),json);
  // Keep the caller timestamp stable so a retry has the same fingerprint.
  snapshot.put("updatedAt",SharedPlanRules.text(input.plan(),"updatedAt",64,true));
  String encoded=json.writeValueAsString(snapshot),fingerprint=SupportRules.digest(encoded);
  var existing=db.queryForList("select view_token,management_hash,snapshot_hash,created_at,expires_at,revoked_at from itinerary_share where id=?",input.requestId());
  if(!existing.isEmpty())return response(created(existing.getFirst(),hash,fingerprint));
  quota(request);String token=newToken();
  // Small bounded cleanup; never touches other features or live links.
  db.update("delete from itinerary_share where id in (select id from itinerary_share where expires_at<now() order by expires_at limit 100)");
  db.update("insert into itinerary_share(id,view_token,management_hash,snapshot_hash,snapshot_json,expires_at) values(?,?,?,?,cast(? as jsonb),now()+interval '90 days') on conflict(id) do nothing",input.requestId(),token,hash,fingerprint,encoded);
  var stored=db.queryForList("select view_token,management_hash,snapshot_hash,created_at,expires_at,revoked_at from itinerary_share where id=?",input.requestId()).getFirst();
  return response(created(stored,hash,fingerprint));
 }
 private static Map<String,Object> created(Map<String,Object> row,String hash,String fingerprint){
  if(!hash.equals(row.get("management_hash")))throw ApiException.forbidden("공유 관리 키를 확인해 주세요.");
  if(row.get("revoked_at")!=null||((java.sql.Timestamp)row.get("expires_at")).toInstant().isBefore(Instant.now()))throw ApiException.notFound("이 공유 링크는 종료되었어요.");
  if(!fingerprint.equals(row.get("snapshot_hash")))throw ApiException.conflict("이미 공유한 내용이에요. 변경한 일정은 새 링크로 만들어 주세요.");
  return Map.of("token",row.get("view_token"),"createdAt",((java.sql.Timestamp)row.get("created_at")).toInstant().toString(),"expiresAt",((java.sql.Timestamp)row.get("expires_at")).toInstant().toString());
 }
 @GetMapping("/{token}") public ResponseEntity<Map<String,Object>> read(@PathVariable String token){
  if(!token.matches("[A-Za-z0-9_-]{22}"))throw ApiException.notFound("공유 일정을 찾을 수 없어요.");
  var rows=db.queryForList("select snapshot_json::text as snapshot,created_at,expires_at from itinerary_share where view_token=? and revoked_at is null and expires_at>now()",token);
  if(rows.isEmpty())throw ApiException.notFound("공유가 종료되었거나 만료된 일정이에요.");var row=rows.getFirst();
  return response(Map.of("plan",json.readTree((String)row.get("snapshot")),"createdAt",((java.sql.Timestamp)row.get("created_at")).toInstant().toString(),"expiresAt",((java.sql.Timestamp)row.get("expires_at")).toInstant().toString()));
 }
 @PostMapping("/{id}/revoke") public ResponseEntity<Void> revoke(@PathVariable UUID id,@RequestBody Revoke input,HttpServletRequest request){
  if(input==null)throw SharedPlanRules.invalid();String hash=keyHash(input.managementKey());
  quota(request);
  // The public read token is deliberately not sufficient to revoke a link.
  // A tombstone also cancels an ambiguous create that arrives after this request.
  int count=db.update("insert into itinerary_share(id,view_token,management_hash,snapshot_hash,snapshot_json,expires_at,revoked_at) values(?,?,?,?,'{}'::jsonb,now()+interval '90 days',now()) on conflict(id) do update set revoked_at=coalesce(itinerary_share.revoked_at,now()),snapshot_json='{}'::jsonb where itinerary_share.management_hash=excluded.management_hash",id,newToken(),hash,hash);
  if(count==0)throw ApiException.notFound("관리할 공유 링크를 찾을 수 없어요.");return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").build();
 }
}
