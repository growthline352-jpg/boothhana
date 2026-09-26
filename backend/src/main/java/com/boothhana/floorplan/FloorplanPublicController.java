package com.boothhana.floorplan;
import java.util.*;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/public/catalog/events")
public class FloorplanPublicController {
 private final FloorplanService service;public FloorplanPublicController(FloorplanService service){this.service=service;}
 @GetMapping("/{id}/floorplans") public Map<String,Object> plans(@PathVariable long id){return service.publicPlans(id);}
}
