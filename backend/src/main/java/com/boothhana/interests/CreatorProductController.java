package com.boothhana.interests;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
import com.boothhana.security.CurrentUser;
import org.springframework.security.core.Authentication;
@RestController
public class CreatorProductController {
 private final CreatorProducts products;private final CurrentUser current;
 public CreatorProductController(CreatorProducts products,CurrentUser current){this.products=products;this.current=current;}
 @GetMapping("/api/me/subculture/products") public Object mine(Authentication auth,@RequestParam(required=false) UUID interestId,@RequestParam(defaultValue="0") int page){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Vary","Cookie").body(products.mine(current.require(auth).id,interestId,page));}
 @GetMapping("/api/public/subculture/products") public Object list(@RequestParam(required=false) UUID subjectId,@RequestParam(required=false) Long creatorId,@RequestParam(defaultValue="0") int page){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(products.list(subjectId,creatorId,page));}
 @GetMapping("/api/public/subculture/products/{id}") public Object detail(@PathVariable UUID id){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(products.detail(id));}
}
