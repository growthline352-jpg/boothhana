package com.boothhana.health;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;

@RestController
public class HealthController {
    private final ReadinessService service;
    public HealthController(ReadinessService service){this.service=service;}
    @GetMapping("/api/public/health/live") public Map<String,String> live(){return Map.of("status","UP");}
    @GetMapping("/api/public/health/ready") public ResponseEntity<Map<String,Object>> ready(){
        var r=service.check();
        return ResponseEntity.status(r.ready()?200:503).header("Cache-Control","no-store")
            .body(Map.of("status",r.ready()?"READY":"NOT_READY","checkedAt",r.checkedAt()));
    }
    @GetMapping("/api/admin/health/readiness") public ReadinessService.Report details(){return service.check();}
}
