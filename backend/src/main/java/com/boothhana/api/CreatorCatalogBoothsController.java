package com.boothhana.api;
import com.boothhana.collection.CreatorCatalogBooths;
import com.boothhana.security.CurrentUser;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/creator/catalog")
public class CreatorCatalogBoothsController {
 private final CreatorCatalogBooths service;private final CurrentUser current;
 public CreatorCatalogBoothsController(CreatorCatalogBooths service,CurrentUser current){this.service=service;this.current=current;}
 @GetMapping("/booths") public List<Map<String,Object>> mine(Authentication a){return service.mine(current.require(a).id);}
 @GetMapping("/events/{event}/availability") public Map<String,Object> availability(Authentication a,@PathVariable long event){return service.availability(event,current.require(a).id);}
 @PostMapping("/events/{event}/booths") public Map<String,Object> create(Authentication a,@PathVariable long event,@RequestBody CreatorCatalogBooths.Input input){return service.create(event,current.require(a).id,input);}
 @GetMapping("/events/{event}/booths/{participant}") public Map<String,Object> detail(Authentication a,@PathVariable long event,@PathVariable long participant){return service.detail(event,participant,current.require(a).id);}
 @PatchMapping("/events/{event}/booths/{participant}") public Map<String,Object> update(Authentication a,@PathVariable long event,@PathVariable long participant,@RequestBody CreatorCatalogBooths.Update input){return service.update(event,participant,current.require(a).id,input);}
 @PostMapping("/events/{event}/booths/{participant}/products") public Map<String,Object> product(Authentication a,@PathVariable long event,@PathVariable long participant,@RequestBody CreatorCatalogBooths.ProductInput input){return service.addProduct(event,participant,current.require(a).id,input);}
}
