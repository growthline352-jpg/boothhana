package com.boothhana.api;

import com.boothhana.api.ApiModels.*;
import com.boothhana.service.PlatformService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final PlatformService service;
    public AdminController(PlatformService service) { this.service = service; }
    @GetMapping("/events") public List<EventView> events() { return service.adminEvents(); }
    @GetMapping("/events/{id}") public EventView event(@PathVariable Long id) { return service.adminEvent(id); }
    @PostMapping("/events") @ResponseStatus(HttpStatus.CREATED) public EventView create(@Valid @RequestBody EventInput input) { return service.createEvent(input); }
    @PatchMapping("/events/{id}") public EventView update(@PathVariable Long id, @Valid @RequestBody EventInput input) { return service.updateEvent(id, input); }
    @DeleteMapping("/events/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable Long id) { service.deleteEvent(id); }
    @PostMapping("/events/{id}/publish") public EventView publish(@PathVariable Long id) { return service.publishEvent(id); }
    @PostMapping("/events/{id}/end") public EventView end(@PathVariable Long id) { return service.endEvent(id); }
    @GetMapping("/applications") public List<ApplicationView> applications() { return service.applications(); }
}
