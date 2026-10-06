package com.boothhana.itinerary;
import com.boothhana.api.ApiException;
import com.boothhana.security.CurrentUser;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;

@RestController
@RequestMapping("/api/me/purchase-plans")
public class PurchasePlans {
 public record Save(long expectedUserId,Long revision,JsonNode plan){}
 private final CurrentUser current;private final PrivatePlanStore store;private final JdbcTemplate db;private final JsonMapper json;
 public PurchasePlans(CurrentUser current,PrivatePlanStore store,JdbcTemplate db,JsonMapper json){this.current=current;this.store=store;this.db=db;this.json=json;}
 @GetMapping public ResponseEntity<List<PrivatePlanStore.Stored>> list(Authentication auth){return PersonalItineraries.response(store.list(PrivatePlanStore.Kind.PURCHASE,current.require(auth).id));}
 @GetMapping("/{eventId}") public ResponseEntity<PrivatePlanStore.PurchaseState> read(Authentication auth,@PathVariable long eventId){if(eventId<1)throw PurchasePlanRules.invalid();return PersonalItineraries.response(store.purchaseState(current.require(auth).id,eventId));}
 @PutMapping("/{eventId}") public ResponseEntity<PrivatePlanStore.Stored> save(Authentication auth,@PathVariable long eventId,@RequestBody Save input){
  long owner=current.require(auth).id;if(input==null||input.revision()==null)throw PurchasePlanRules.invalid();PersonalItineraries.expected(owner,input.expectedUserId());var plan=PurchasePlanRules.checked(input.plan(),eventId,json);
  var previous=store.list(PrivatePlanStore.Kind.PURCHASE,owner).stream().filter(s->s.plan().path("eventId").asLong()==eventId).findFirst();
  if(previous.isEmpty()&&db.queryForObject("select count(*) from memory_item where user_id=? and event_id=?",Long.class,owner,eventId)==0)throw ApiException.badRequest("보관함에 저장한 행사를 선택해 주세요.");
  var retained=new HashSet<String>();if(previous.isPresent()){for(String field:List.of("items","booths"))for(var item:previous.get().plan().path(field))if(item.hasNonNull("memoryId"))retained.add(item.get("memoryId").asString());for(var ref:previous.get().plan().path("excludedMemoryIds"))retained.add(ref.asString());}
  for(var item:plan.path("items")){if(!item.hasNonNull("memoryId"))continue;String id=item.get("memoryId").asString();if(retained.contains(id))continue;
   if(db.queryForObject("select count(*) from memory_item where user_id=? and event_id=? and id=? and target_type in ('PARTICIPANT','PRODUCT')",Long.class,owner,eventId,UUID.fromString(id))==0)throw ApiException.badRequest("내 보관함의 부스·상품을 선택해 주세요.");
  }
  for(var booth:plan.path("booths")){if(!booth.hasNonNull("memoryId"))continue;String id=booth.get("memoryId").asString();if(!retained.contains(id)&&db.queryForObject("select count(*) from memory_item where user_id=? and event_id=? and id=? and target_type='PARTICIPANT'",Long.class,owner,eventId,UUID.fromString(id))==0)throw ApiException.badRequest("내 보관함의 부스를 선택해 주세요.");}
  for(var ref:plan.path("excludedMemoryIds")){String id=ref.asString();if(!retained.contains(id)&&db.queryForObject("select count(*) from memory_item where user_id=? and event_id=? and id=? and target_type='PRODUCT'",Long.class,owner,eventId,UUID.fromString(id))==0)throw ApiException.badRequest("내 보관함의 상품을 선택해 주세요.");}
  return PersonalItineraries.response(store.save(PrivatePlanStore.Kind.PURCHASE,owner,eventId,input.revision(),plan));
 }
 @DeleteMapping("/{eventId}") public ResponseEntity<Void> delete(Authentication auth,@PathVariable long eventId,@RequestParam long revision,@RequestParam long expectedUserId){
  long owner=current.require(auth).id;PersonalItineraries.expected(owner,expectedUserId);
  if(eventId<1)throw PurchasePlanRules.invalid();
  store.delete(PrivatePlanStore.Kind.PURCHASE,owner,eventId,revision);
  return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).header("Vary","Cookie").build();
 }
}
