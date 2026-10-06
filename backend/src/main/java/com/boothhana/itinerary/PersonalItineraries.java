package com.boothhana.itinerary;

import com.boothhana.api.ApiException;
import com.boothhana.security.CurrentUser;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/me/itineraries")
public class PersonalItineraries {
 public record Save(long expectedUserId,Long revision,JsonNode plan){}
 private final CurrentUser current;private final PrivatePlanStore store;private final JsonMapper json;
 public PersonalItineraries(CurrentUser current,PrivatePlanStore store,JsonMapper json){this.current=current;this.store=store;this.json=json;}
 static <T> ResponseEntity<T> response(T value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Vary","Cookie").body(value);}
 static void expected(long owner,long expected){if(owner!=expected)throw ApiException.conflict("계정이 바뀌었어요. 현재 계정에서 다시 열어 주세요.");}
 @GetMapping public ResponseEntity<List<PrivatePlanStore.Stored>> list(Authentication auth){return response(store.list(PrivatePlanStore.Kind.ITINERARY,current.require(auth).id));}
 @PutMapping("/{id}") public ResponseEntity<PrivatePlanStore.Stored> save(Authentication auth,@PathVariable UUID id,@RequestBody Save input){
  long owner=current.require(auth).id;if(input==null||input.revision()==null)throw ApiException.badRequest("일정과 저장 버전을 확인해 주세요.");expected(owner,input.expectedUserId());
  var plan=SharedPlanRules.snapshot(input.plan(),true,json);
  if(!id.toString().equals(plan.get("id")))throw ApiException.badRequest("일정 번호가 일치하지 않아요.");
  try{plan.put("updatedAt",Instant.parse(SharedPlanRules.text(input.plan(),"updatedAt",64,true)).toString());}catch(java.time.DateTimeException e){throw ApiException.badRequest("일정 수정 시각을 확인해 주세요.");}
  return response(store.save(PrivatePlanStore.Kind.ITINERARY,owner,id,input.revision(),json.valueToTree(plan)));
 }
 @DeleteMapping("/{id}") public ResponseEntity<Void> delete(Authentication auth,@PathVariable UUID id,@RequestParam long revision,@RequestParam long expectedUserId){long owner=current.require(auth).id;expected(owner,expectedUserId);store.delete(PrivatePlanStore.Kind.ITINERARY,owner,id,revision);return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).header("Vary","Cookie").build();}
}
