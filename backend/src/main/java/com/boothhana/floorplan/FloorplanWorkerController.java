package com.boothhana.floorplan;
import java.util.*;
import java.io.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import static com.boothhana.floorplan.FloorplanModels.*;
@RestController
@RequestMapping("/api/internal/subculture/v4/floorplans")
public class FloorplanWorkerController {
 private final FloorplanService service;public FloorplanWorkerController(FloorplanService service){this.service=service;}
 @GetMapping("/targets") public List<Map<String,Object>> targets(@RequestParam(defaultValue="false") boolean imminent,@RequestParam(defaultValue="50") int limit){return service.targets(imminent,limit);}
 @PostMapping("/events/{id}/claim") public Map<String,Object> claim(@PathVariable long id,@RequestBody Claim c){return service.claim(id,c);}
 @PostMapping("/events/{id}/heartbeat") public Map<String,Object> heartbeat(@PathVariable long id,@RequestBody Claim c){return service.heartbeat(id,c);}
 @PostMapping("/events/{id}/observations") public Map<String,Object> observe(@PathVariable long id,@RequestBody Observation v){return service.observe(id,v);}
 @GetMapping("/events/{id}/sources") public List<Map<String,Object>> sources(@PathVariable long id){return service.sources(id);}
 @PostMapping("/events/{id}/versions") public Map<String,Object> begin(@PathVariable long id,@RequestBody Begin b){return service.begin(id,b);}
 @PostMapping("/versions/{id}/content") public Map<String,Object> content(@PathVariable UUID id,@RequestHeader("X-Floorplan-Lease") String lease,HttpServletRequest r)throws IOException{return service.content(id,lease,r.getInputStream());}
 @PostMapping("/versions/{id}/analysis") public Map<String,Object> analysis(@PathVariable UUID id,@RequestBody Analysis a){return service.analysis(id,a);}
 @PostMapping("/versions/{id}/remap") public Map<String,Object> remap(@PathVariable UUID id,@RequestBody Claim c){return service.remap(id,c);}
 @PostMapping("/events/{id}/sources/{asset}/failure") public Map<String,Object> sourceFailure(@PathVariable long id,@PathVariable long asset,@RequestBody Failure f){return service.sourceFailure(id,asset,f);}
 @PostMapping("/events/{id}/finish") public Map<String,Object> finish(@PathVariable long id,@RequestBody Failure f){return service.finish(id,f);}
}
