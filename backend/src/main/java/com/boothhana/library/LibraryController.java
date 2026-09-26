package com.boothhana.library;

import com.boothhana.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.boothhana.library.LibraryModels.*;

@RestController
public class LibraryController {
    private final LibraryService service; private final CurrentUser current;
    public LibraryController(LibraryService service,CurrentUser current){this.service=service;this.current=current;}
    private long owner(Authentication auth){return current.require(auth).id;}
    private <T> ResponseEntity<T> privateResponse(T value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Vary","Cookie").body(value);}
    @GetMapping("/api/me/library/items") public ResponseEntity<Page> list(Authentication auth,@RequestParam(defaultValue="") String q,@RequestParam(required=false) Long eventId,@RequestParam(defaultValue="") String type,@RequestParam(defaultValue="false") boolean visited,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="24") int size){return privateResponse(service.list(owner(auth),q,eventId,type,visited,page,size));}
    @GetMapping("/api/me/library/index") public ResponseEntity<List<Index>> index(Authentication auth){return privateResponse(service.index(owner(auth)));}
    @PutMapping("/api/me/library/items") public ResponseEntity<SaveResult> save(Authentication auth,@Valid @RequestBody Save input){return privateResponse(service.save(owner(auth),input));}
    @PostMapping("/api/me/library/import") public ResponseEntity<ImportResult> importOne(Authentication auth,@Valid @RequestBody Import input){return privateResponse(service.importItem(owner(auth),input));}
    @GetMapping("/api/me/library/items/{id}") public ResponseEntity<Entry> detail(Authentication auth,@PathVariable UUID id){return privateResponse(service.detail(owner(auth),id));}
    @PatchMapping("/api/me/library/items/{id}") public ResponseEntity<Entry> edit(Authentication auth,@PathVariable UUID id,@Valid @RequestBody Edit input){return privateResponse(service.edit(owner(auth),id,input));}
    @DeleteMapping("/api/me/library/items/{id}") public ResponseEntity<Void> delete(Authentication auth,@PathVariable UUID id,@RequestParam long revision){service.delete(owner(auth),id,revision);return ResponseEntity.noContent().header("Cache-Control","no-store").header("Vary","Cookie").build();}
    @PutMapping("/api/me/library/items/{id}/visit") public ResponseEntity<Entry> visit(Authentication auth,@PathVariable UUID id,@Valid @RequestBody Visit input){return privateResponse(service.visit(owner(auth),id,input));}
    @PostMapping("/api/me/library/items/{id}/activity") public ResponseEntity<Void> activity(Authentication auth,@PathVariable UUID id,@Valid @RequestBody Activity input){service.activity(owner(auth),id,input.action());return ResponseEntity.noContent().header("Cache-Control","no-store").header("Vary","Cookie").build();}
    // Guest draft resolution accepts IDs ONLY, never titles/URLs/private notes. CSRF remains required.
    @PostMapping("/api/public/library/resolve") public ResponseEntity<List<Resolved>> resolve(@Valid @RequestBody Resolve input){return privateResponse(service.resolve(input.targets()));}
}
