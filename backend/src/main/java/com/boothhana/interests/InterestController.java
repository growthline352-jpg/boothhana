package com.boothhana.interests;

import com.boothhana.collection.CatalogPublicationService;
import com.boothhana.security.CurrentUser;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
public class InterestController {
    private final InterestService interests;private final CurrentUser current;private final CatalogPublicationService catalog;
    public InterestController(InterestService interests,CurrentUser current,CatalogPublicationService catalog){this.interests=interests;this.current=current;this.catalog=catalog;}
    @GetMapping("/api/public/interests") public List<InterestTaxonomy.Field> options(){return InterestTaxonomy.FIELDS;}
    @GetMapping("/api/me/interests") public ResponseEntity<InterestService.View> get(Authentication auth){return privateResponse(interests.get(current.require(auth)));}
    @PutMapping("/api/me/interests") public ResponseEntity<InterestService.View> save(Authentication auth,@RequestBody InterestService.Input input){return privateResponse(interests.save(current.require(auth),input));}
    @GetMapping("/api/me/interests/featured") public ResponseEntity<Map<String,Object>> featured(Authentication auth,
            @RequestParam String category,@RequestParam(defaultValue="") String region){
        var selected=interests.get(current.require(auth)).fields().get(category);return privateResponse(catalog.featured(category,region,selected));
    }
    private static <T> ResponseEntity<T> privateResponse(T body){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);}
}
