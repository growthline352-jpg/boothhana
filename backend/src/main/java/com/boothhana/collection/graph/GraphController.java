package com.boothhana.collection.graph;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.boothhana.collection.graph.GraphModels.*;
@RestController
@ConditionalOnProperty(name="app.collection.graph.enabled",havingValue="true")
@RequestMapping("/api/internal/subculture/v6")
public class GraphController {
 private final GraphService service;
 public GraphController(GraphService service){this.service=service;}
 @PostMapping("/jobs") public Object seed(@RequestBody Seed body){return service.seed(body);}
 @PostMapping("/bootstrap") public Object bootstrap(@RequestBody Bootstrap body){return service.bootstrap(body);}
 @PostMapping("/refresh") public Object refresh(@RequestBody Bootstrap body){return service.refresh(body);}
 @PostMapping("/refresh-creators") public Object refreshCreators(@RequestBody Bootstrap body){return service.refreshCreators(body);}
 @PostMapping("/claim") public Object claim(){return service.claim();}
 @PostMapping("/jobs/{id}/heartbeat") public Object heartbeat(@PathVariable UUID id,@RequestBody Lease body){return service.heartbeat(id,body.leaseToken());}
 @PostMapping("/jobs/{id}/extract") public Object extract(@PathVariable UUID id,@RequestBody Extraction body){return service.extract(id,body);}
 @PostMapping("/jobs/{id}/decide") public Object decide(@PathVariable UUID id,@RequestBody Decision body){return service.decide(id,body);}
 @PostMapping("/jobs/{id}/failure") public Object fail(@PathVariable UUID id,@RequestBody Failure body){return service.fail(id,body);}
 @GetMapping("/status") public Object status(){return service.status();}
}
