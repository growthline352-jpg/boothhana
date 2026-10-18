package com.boothhana.collection;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import static com.boothhana.collection.CollectionModels.*;
@RestController
@RequestMapping("/api/public/catalog")
public class CatalogPublicController {
    private final CatalogPublicationService publications;
    private final CatalogEventPages pages;
    public CatalogPublicController(CatalogPublicationService publications,CatalogEventPages pages){this.publications=publications;this.pages=pages;}
    @GetMapping("/events") public PageData<Map<String,Object>> list(
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size,
            @RequestParam(defaultValue="SUBCULTURE") String category, @RequestParam(defaultValue="") String q,
            @RequestParam(defaultValue="") String subcategory, @RequestParam(defaultValue="") String from,
            @RequestParam(defaultValue="") String to, @RequestParam(defaultValue="RECENT") String sort,
            @RequestParam(defaultValue="") String region,@RequestParam(defaultValue="") String areas,@RequestParam(defaultValue="false") boolean grouped) {
        final CatalogBrowseQuery query;
        try { query = new CatalogBrowseQuery(page,size,category,q,subcategory,from,to,sort,region,areas); }
        catch (IllegalArgumentException e) { throw com.boothhana.api.ApiException.badRequest(e.getMessage()); }
        return grouped?publications.groupedList(query):publications.list(query);
    }
    @GetMapping("/events/popular") public List<Map<String,Object>> popular(@RequestParam(defaultValue="") String category){return publications.popular(12,category);}
    @GetMapping("/events/featured") public Map<String,Object> featured(@RequestParam String category,@RequestParam(defaultValue="") String region){return publications.featured(category,region,null);}
    @GetMapping("/events/{id}") public Map<String,Object> detail(@PathVariable long id){return publications.detail(id);}
    @GetMapping("/events/{id}/overview") public Map<String,Object> overview(@PathVariable long id){return pages.overview(id);}
    @GetMapping("/events/{id}/booths") public Map<String,Object> booths(@PathVariable long id,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="24") int size,
        @RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String day,@RequestParam(defaultValue="") String hall,
        @RequestParam(defaultValue="") String subject,@RequestParam(defaultValue="") String category,@RequestParam(defaultValue="") String ids){return pages.booths(id,page,size,q,day,hall,subject,category,ids);}
    @GetMapping("/events/{id}/booths/{participant}") public Map<String,Object> booth(@PathVariable long id,@PathVariable long participant){return pages.booth(id,participant);}
    @GetMapping("/events/{id}/map") public Map<String,Object> map(@PathVariable long id){return pages.map(id);}
}
