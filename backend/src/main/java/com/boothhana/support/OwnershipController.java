package com.boothhana.support;
import com.boothhana.security.CurrentUser;
import com.boothhana.api.ApiException;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import java.util.*;
import static com.boothhana.support.SupportModels.*;
import static com.boothhana.support.OwnershipCatalogService.*;

@RestController
public class OwnershipController {
 private final OwnershipCatalogService service;private final CurrentUser current;
 public OwnershipController(OwnershipCatalogService service,CurrentUser current){this.service=service;this.current=current;}
 private Principal admin(Authentication a){long id=current.require(a).id;if(a.getAuthorities().stream().noneMatch(x->"ROLE_ADMIN".equals(x.getAuthority())))throw ApiException.forbidden("관리자 전용");return new Principal(id,true,false);}
 @GetMapping("/api/public/ownership/events/{event}") public Map<String,Object> info(@PathVariable long event){return service.publicInfo(event);}
 @GetMapping("/api/public/ownership/events/{event}/history") public Map<String,Object> history(@PathVariable long event,@RequestParam(defaultValue="0")int page){return service.history(event,page);}
 @GetMapping("/api/me/ownership/events") public List<Map<String,Object>> mine(Authentication a){return service.managedEvents(current.require(a).id);}
 @GetMapping("/api/admin/ownership/organizers") public List<Map<String,Object>> organizers(Authentication a){return service.organizers(admin(a));}
 @GetMapping("/api/admin/ownership/series") public List<Map<String,Object>> series(Authentication a){return service.series(admin(a));}
 @GetMapping("/api/admin/ownership/events/{event}/series") public Map<String,Object> link(Authentication a,@PathVariable long event){return service.seriesLink(event,admin(a));}
 @PutMapping("/api/admin/ownership/events/{event}/series") public Map<String,Object> link(Authentication a,@PathVariable long event,@RequestBody SeriesInput input){return service.linkSeries(event,input,admin(a));}
 @GetMapping("/api/admin/ownership/events/{event}/candidates") public List<Map<String,Object>> candidates(Authentication a,@PathVariable long event,@RequestParam String q){return service.candidates(event,q,admin(a));}
 @PostMapping("/api/admin/ownership/events/{event}/managers/{user}/revoke") public void revoke(Authentication a,@PathVariable long event,@PathVariable long user,@RequestBody Revoke input){service.revokeEvent(event,user,input,admin(a));}
 @GetMapping("/api/me/ownership/events/{event}/edit") public Map<String,Object> editable(Authentication a,@PathVariable long event,@RequestParam String type,@RequestParam(defaultValue="0")long participant){return service.editable(type,event,participant,current.require(a).id);}
 @PatchMapping("/api/me/ownership/events/{event}/edit") public Map<String,Object> edit(Authentication a,@PathVariable long event,@RequestParam String type,@RequestParam(defaultValue="0")long participant,@RequestBody OwnerEdit input){return service.edit(type,event,participant,input,current.require(a).id);}
 @GetMapping("/api/me/ownership/events/{event}/booths/{participant}/products") public Map<String,Object> products(Authentication a,@PathVariable long event,@PathVariable long participant){return service.products(event,participant,current.require(a).id);}
 @PatchMapping("/api/me/ownership/events/{event}/booths/{participant}/products/{product}") public Map<String,Object> product(Authentication a,@PathVariable long event,@PathVariable long participant,@PathVariable long product,@RequestBody ProductEdit input){return service.editProduct(event,participant,product,input,current.require(a).id);}
}
