package com.boothhana.interests;
import com.boothhana.security.CurrentUser;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
@RestController
public class NotificationController {
 private final NotificationService service;private final CurrentUser current;
 public NotificationController(NotificationService service,CurrentUser current){this.service=service;this.current=current;}
 private Object response(Object v){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Vary","Cookie").body(v);}
 @GetMapping("/api/me/subculture/notifications") public Object list(Authentication auth,@RequestParam(defaultValue="0") int page){return response(service.inbox(current.require(auth).id,page));}
 @PostMapping("/api/me/subculture/notifications/{id}/read") public Object read(Authentication auth,@PathVariable UUID id){service.read(current.require(auth).id,id);return response(Map.of("ok",true));}
 @PostMapping("/api/me/subculture/notifications/read-all") public Object readAll(Authentication auth){service.readAll(current.require(auth).id);return response(Map.of("ok",true));}
 @GetMapping("/api/me/subculture/push") public Object config(Authentication auth){return response(service.configuration(current.require(auth).id));}
 @PostMapping("/api/me/subculture/push") public Object subscribe(Authentication auth,@RequestBody NotificationService.Subscription input){service.subscribe(current.require(auth).id,input);return response(Map.of("ok",true));}
 @DeleteMapping("/api/me/subculture/push") public Object unsubscribe(Authentication auth,@RequestBody Map<String,String> input){service.unsubscribe(current.require(auth).id,input.get("endpoint"));return response(Map.of("ok",true));}
}
