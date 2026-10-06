package com.boothhana.collection;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import com.boothhana.api.ApiException;
import java.util.*;
@RestController @RequestMapping("/api/public/catalog")
public class CatalogDiscoveryController {
 private final CatalogDiscoveryService service;
 private final boolean compareEnabled,popupsEnabled;
 public CatalogDiscoveryController(CatalogDiscoveryService service,@Value("${app.discovery.compare-enabled:false}") boolean compareEnabled,@Value("${app.discovery.popups-enabled:true}") boolean popupsEnabled){this.service=service;this.compareEnabled=compareEnabled;this.popupsEnabled=popupsEnabled;}
 @GetMapping("/events/compare") public List<Map<String,Object>> compare(@RequestParam String ids){if(!compareEnabled)throw ApiException.notFound("기능 공개 준비 중");return service.compare(ids);}
 @GetMapping("/popups") public Map<String,Object> popups(@RequestParam String from,@RequestParam String to,@RequestParam(defaultValue="") String neighborhood){if(!popupsEnabled)throw ApiException.notFound("기능 공개 준비 중");return service.popups(from,to,neighborhood);}
}
