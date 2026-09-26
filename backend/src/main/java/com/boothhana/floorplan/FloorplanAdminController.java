package com.boothhana.floorplan;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import static com.boothhana.floorplan.FloorplanModels.*;
@RestController
@RequestMapping("/api/admin/subculture/v4/floorplans")
public class FloorplanAdminController {
 private final FloorplanService service;public FloorplanAdminController(FloorplanService service){this.service=service;}
 @GetMapping("/events/{id}") public Map<String,Object> detail(@PathVariable long id){return service.admin(id);}
 @PutMapping("/events/{id}/watch") public Map<String,Object> watch(@PathVariable long id,@RequestBody WatchEdit e){return service.editWatch(id,e);}
 @PutMapping("/events/{id}/sources/{asset}/permission") public Map<String,Object> permit(@PathVariable long id,@PathVariable long asset,@RequestBody Permission p){return service.permit(id,asset,p);}
 @PutMapping("/events/{id}/sources/{asset}/scope") public Map<String,Object> scope(@PathVariable long id,@PathVariable long asset,@RequestBody SourceEdit p){return service.editSource(id,asset,p);}
 @GetMapping("/versions/{id}") public Map<String,Object> version(@PathVariable UUID id){return service.version(id);}
 @PutMapping("/versions/{id}") public Map<String,Object> edit(@PathVariable UUID id,@RequestBody Edit e){return service.edit(id,e);}
 @PostMapping("/versions/{id}/publish") public Map<String,Object> publish(@PathVariable UUID id,@RequestBody Publish p){return service.publish(id,p);}
 @PostMapping("/versions/{id}/withdraw") @ResponseStatus(HttpStatus.NO_CONTENT) public void withdraw(@PathVariable UUID id,@RequestBody Publish p){service.withdraw(id,p);}
}
