package com.boothhana.api;

import com.boothhana.api.ApiModels.*;
import com.boothhana.service.PlatformService;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/public")
public class PublicController {
    private final PlatformService service;
    public PublicController(PlatformService service) { this.service = service; }
    @GetMapping("/events") public List<EventView> events() { return service.publicEvents(); }
    @GetMapping("/events/{id}") public EventView event(@PathVariable Long id) { return service.publicEvent(id); }
    @GetMapping("/events/{id}/booths") public List<BoothView> booths(@PathVariable Long id) { return service.publicEventBooths(id); }
    @GetMapping("/booths/{id}") public BoothView booth(@PathVariable Long id) { return service.publicBooth(id); }
    @GetMapping("/booths/{id}/products") public List<ProductView> products(@PathVariable Long id) { return service.publicProducts(id); }
    @GetMapping("/products/{id}") public ProductView product(@PathVariable Long id) { return service.publicProduct(id); }
}
