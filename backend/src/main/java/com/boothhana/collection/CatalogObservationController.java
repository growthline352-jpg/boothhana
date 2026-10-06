package com.boothhana.collection;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.boothhana.collection.CatalogObservationService.*;
@RestController
public class CatalogObservationController {
 private final CatalogObservationService service;
 public CatalogObservationController(CatalogObservationService service){this.service=service;}
 @GetMapping("/api/internal/subculture/v4/recheck-events") public List<Map<String,Object>> due(@RequestParam(defaultValue="25") int limit,@RequestParam(defaultValue="-1") long afterId){return service.due(limit,afterId);}
 @PostMapping("/api/internal/subculture/v4/events/{id}/source-exhausted") public Map<String,Object> exhausted(@PathVariable long id,@RequestBody ExhaustedInput input){return service.sourceExhausted(id,input);}
 @GetMapping("/api/internal/subculture/v4/recheck-workload") public Map<String,Object> workload(){return service.workload();}
 @GetMapping("/api/admin/subculture/v4/recheck-summary") public Map<String,Object> summary(){return service.summary();}
 @PostMapping("/api/internal/subculture/v4/events/{id}/observations") public Map<String,Object> observe(@PathVariable long id,@RequestBody ObservationInput input){return service.observe(id,input);}
 @GetMapping("/api/admin/subculture/v4/events/{id}/observations") public Map<String,Object> workspace(@PathVariable long id){return service.workspace(id);}
 @PostMapping("/api/admin/subculture/v4/events/{id}/observations/{observationId}/review") public Map<String,Object> review(@PathVariable long id,@PathVariable UUID observationId,@RequestBody ReviewInput input){return service.review(id,observationId,input);}
 @PutMapping("/api/admin/subculture/v4/events/{id}/place") public Map<String,Object> place(@PathVariable long id,@RequestBody PlaceInput input){return service.place(id,input);}
}
