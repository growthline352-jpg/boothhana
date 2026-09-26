package com.boothhana.collection;

import static com.boothhana.collection.CollectionModels.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/subculture")
public class CollectionAdminController {
    private final CollectionService service;
    public CollectionAdminController(CollectionService service) { this.service=service; }
    @GetMapping("/candidates") public PageData<CandidateSummary> candidates(
        @RequestParam(defaultValue="PENDING") String state,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return service.candidates(state,page,size);
    }
    @GetMapping("/candidates/{id}") public CandidateDetail detail(@PathVariable long id) { return service.detail(id); }
    @PatchMapping("/candidates/{id}/review") public CandidateDetail review(@PathVariable long id,@RequestBody ReviewInput input) { return service.review(id,input); }
    @GetMapping("/runs") public PageData<RunSummary> runs(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return service.runs(page,size); }
}
