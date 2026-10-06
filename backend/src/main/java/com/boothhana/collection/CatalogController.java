package com.boothhana.collection;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;

@RestController
@RequestMapping("/api/internal/subculture/v4")
public class CatalogController {
    private final CatalogService service;private final CatalogMediaService media;
    private final CatalogAutoApproval approval;
    public CatalogController(CatalogService service,CatalogMediaService media){this(service,media,null);}
    @org.springframework.beans.factory.annotation.Autowired
    public CatalogController(CatalogService service,CatalogMediaService media,CatalogAutoApproval approval){this.service=service;this.media=media;this.approval=approval;}
    @GetMapping("/auto-approval-events") public List<Long> approvalEvents(@RequestParam(defaultValue="200") int limit,@RequestParam(defaultValue="0") long afterId){return approval.pending(limit,afterId);}
    @PostMapping("/events/{id}/auto-approve") public Map<String,Object> approve(@PathVariable long id){return approval.approve(id);}
    @GetMapping("/events/{id}") public Map<String,Object> event(@PathVariable long id){var row=service.eventDetail(id);return Map.of("id",row.get("id"),"revision",row.get("revision"),"event",row.get("event"));}
    @PostMapping("/pipelines") public Map<String,Object> start(@RequestBody PipelineInput input){return service.start(input);}
    @PostMapping("/pipelines/{id}/heartbeat") public Map<String,Object> heartbeat(@PathVariable String id){return service.heartbeat(id);}
    @PostMapping("/pipelines/{id}/finish") public Map<String,Object> finish(@PathVariable String id,@RequestBody PipelineFinish input){return service.finish(id,input);}
    @PostMapping("/pipelines/{id}/event-assets") public Map<String,Object> assets(@PathVariable String id){return service.syncEventAssets(id);}
    @GetMapping("/pipelines/{id}/events") public List<Map<String,Object>> events(@PathVariable String id,@RequestParam(defaultValue="50") int limit){return service.eventTargets(id,limit);}
    @GetMapping("/pipelines/{id}/enrichment-events") public List<Map<String,Object>> enrichmentEvents(@PathVariable String id,@RequestParam(defaultValue="200") int limit,@RequestParam(defaultValue="0") long afterId){return service.enrichmentTargets(id,limit,afterId);}
    @GetMapping("/pipelines/{id}/participants") public List<Map<String,Object>> participants(@PathVariable String id,@RequestParam(defaultValue="100") int limit){return service.salesTargets(id,limit);}
    @PostMapping("/pipelines/{id}/events/{eventId}/cursors") public List<Map<String,Object>> cursors(@PathVariable String id,@PathVariable long eventId){return service.participantCursors(id,eventId);}
    @PostMapping("/pipelines/{id}/participants/{participantId}/attempt") public Map<String,Object> attempt(@PathVariable String id,@PathVariable long participantId,@RequestBody SalesAttemptInput input){return service.salesAttempt(id,participantId,input);}
    @PostMapping("/stages") public StageReceipt stage(@RequestBody StageBatch batch){return service.ingest(batch);}
    @PostMapping("/manual-stages") public StageReceipt manualStage(@RequestBody StageBatch batch){return service.ingestManual(batch);}
    @GetMapping("/assets") public List<AssetView> assets(@RequestParam(defaultValue="100") int limit){return media.pending(limit);}
    @GetMapping("/assets/{id}") public AssetView asset(@PathVariable long id){return media.detail(id);}
    @GetMapping("/image-repair-events") public List<Map<String,Object>> imageRepairEvents(@RequestParam(defaultValue="100") int limit,@RequestParam(defaultValue="0") long afterId){return service.imageRepairTargets(limit,afterId);}
    @PostMapping("/events/{id}/assets") public AssetView registerAsset(@PathVariable long id,@RequestBody AssetRegistrationInput input){return media.registerValidated(id,input);}
    @PostMapping("/assets/{id}/content") public AssetView content(@PathVariable long id,@RequestHeader("X-Asset-Revision") long revision,
        @RequestHeader("X-Image-SHA256") String digest,@RequestHeader("X-Image-Size") long size,HttpServletRequest request) throws IOException {
        return media.content(id,revision,request.getContentType(),digest,size,request.getInputStream());
    }
    @PostMapping("/assets/{id}/failure") public AssetView failure(@PathVariable long id,@RequestBody AssetFailure failure){return media.failed(id,failure);}
}
