package com.boothhana.itinerary;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import java.util.Map;

@RestController
@RequestMapping("/api/public/itinerary/places")
public class ItineraryPlacesController {
    private final ItineraryPlaces places;
    public ItineraryPlacesController(ItineraryPlaces places) { this.places=places; }
    @GetMapping("/search") public ResponseEntity<Map<String,Object>> search(@RequestParam String q,@RequestParam double lat,@RequestParam double lon) {
        return response(places.search(q,lat,lon));
    }
    @GetMapping("/nearby") public ResponseEntity<Map<String,Object>> nearby(@RequestParam double lat,@RequestParam double lon) {
        return response(places.nearby(lat,lon));
    }
    @GetMapping("/geocode") public ResponseEntity<Map<String,Object>> geocode(@RequestParam String address) {
        return response(places.geocode(address));
    }
    private static ResponseEntity<Map<String,Object>> response(Map<String,Object> body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
