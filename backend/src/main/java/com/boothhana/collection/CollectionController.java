package com.boothhana.collection;

import static com.boothhana.collection.CollectionModels.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/internal/subculture")
public class CollectionController {
    private final CollectionService service;
    public CollectionController(CollectionService service) { this.service=service; }
    @PostMapping("/batches") public Receipt ingest(@RequestBody Batch batch) { return service.ingest(batch); }
}
