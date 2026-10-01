package com.boothhana.collection;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import static com.boothhana.collection.CollectionModels.*;
@RestController
@RequestMapping("/api/public/catalog")
public class CatalogPublicController {
    private final CatalogPublicationService publications;
    public CatalogPublicController(CatalogPublicationService publications){this.publications=publications;}
    @GetMapping("/events") public PageData<Map<String,Object>> list(
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size,
            @RequestParam(defaultValue="SUBCULTURE") String category, @RequestParam(defaultValue="") String q,
            @RequestParam(defaultValue="") String subcategory, @RequestParam(defaultValue="") String from,
            @RequestParam(defaultValue="") String to, @RequestParam(defaultValue="RECENT") String sort,
            @RequestParam(defaultValue="") String region) {
        final CatalogBrowseQuery query;
        try { query = new CatalogBrowseQuery(page,size,category,q,subcategory,from,to,sort,region); }
        catch (IllegalArgumentException e) { throw com.boothhana.api.ApiException.badRequest(e.getMessage()); }
        return publications.list(query);
    }
    @GetMapping("/events/popular") public List<Map<String,Object>> popular(@RequestParam(defaultValue="") String category){return publications.popular(12,category);}
    @GetMapping("/events/featured") public Map<String,Object> featured(@RequestParam String category,@RequestParam(defaultValue="") String region){return publications.featured(category,region,null);}
    @GetMapping("/events/{id}") public Map<String,Object> detail(@PathVariable long id){return publications.detail(id);}
}
