package com.boothhana.collection.graph;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.UUID;
import static com.boothhana.collection.graph.EntityMediaModels.*;

@RestController
@ConditionalOnProperty(name="app.collection.graph.enabled",havingValue="true")
@RequestMapping("/api/internal/subculture/v6/media")
public class EntityMediaController {
 private final EntityMediaService service;
 public EntityMediaController(EntityMediaService service){this.service=service;}
 @GetMapping("/targets") public Object targets(@RequestParam String kind,@RequestParam(defaultValue="") String afterId,@RequestParam(defaultValue="100") int limit){return service.targets(kind,afterId,limit);}
 @GetMapping("/context") public Object context(@RequestParam String kind,@RequestParam String targetId){return service.context(kind,targetId);}
 @PostMapping("/candidates") public Object extract(@RequestBody ExtractionInput input){return service.extract(input);}
 @GetMapping("/{id}") public Object detail(@PathVariable UUID id){return service.detail(id);}
 @PostMapping("/{id}/review") public Object review(@PathVariable UUID id,@RequestBody ReviewInput input){return service.review(id,input);}
 @PostMapping("/{id}/content") public Object content(@PathVariable UUID id,@RequestHeader("X-Asset-Revision") long revision,
  @RequestHeader("X-Image-SHA256") String digest,@RequestHeader("X-Image-Size") long size,HttpServletRequest request) throws IOException {
  return service.content(id,revision,request.getContentType(),digest,size,request.getInputStream());
 }
 @PostMapping("/{id}/failure") public Object failure(@PathVariable UUID id,@RequestBody FailureInput input){return service.failed(id,input);}
}
