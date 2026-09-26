package com.boothhana.collection;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;

@RestController
@RequestMapping("/api/admin/subculture/v4")
public class CatalogAdminController {
    private final CatalogService service;private final CatalogMediaService media;private final CatalogPublicationService publications;
    public CatalogAdminController(CatalogService service,CatalogMediaService media,CatalogPublicationService publications){this.service=service;this.media=media;this.publications=publications;}
    @GetMapping("/events") public PageData<Map<String,Object>> events(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.events(page,size);}
    @GetMapping("/events/{id}") public Map<String,Object> event(@PathVariable long id){return service.eventDetail(id);}
    @PatchMapping("/events/{id}") public Map<String,Object> editEvent(@PathVariable long id,@RequestBody EditInput input){return service.editEvent(id,input);}
    @GetMapping("/events/{id}/participants") public PageData<ParticipantView> participants(@PathVariable long id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="") String q){return service.participants(id,page,size,q);}
    @GetMapping("/participants/{id}") public ParticipantView participant(@PathVariable long id){return service.participant(id);}
    @PatchMapping("/participants/{id}") public ParticipantView editParticipant(@PathVariable long id,@RequestBody EditInput input){return service.editParticipant(id,input);}
    @PatchMapping("/participants/{id}/sales") public ParticipantView editSales(@PathVariable long id,@RequestBody EditInput input){return service.editSales(id,input);}
    @PatchMapping("/assets/{id}/rights") public AssetView rights(@PathVariable long id,@RequestBody RightsInput input){return media.rights(id,input);}
    @PutMapping("/events/{id}/banner") public BannerSelection banner(@PathVariable long id,@RequestBody BannerInput input){return media.selectBanner(id,input);}
    @PostMapping("/events/{id}/publish") public Map<String,Object> publish(@PathVariable long id,@RequestBody PublishInput input){return publications.publish(id,input);}
    @DeleteMapping("/events/{id}/publish") @ResponseStatus(HttpStatus.NO_CONTENT) public void unpublish(@PathVariable long id){publications.unpublish(id);}
    @GetMapping("/runs") public PageData<Map<String,Object>> runs(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return service.pipelineRuns(page,size);}
}
