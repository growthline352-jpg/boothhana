package com.boothhana.goods;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;

@RestController
public class GoodsShowcaseController {
    private final GoodsShowcaseService service;
    public GoodsShowcaseController(GoodsShowcaseService service){this.service=service;}
    @GetMapping("/api/public/goods/bestsellers")
    public ResponseEntity<GoodsShowcaseService.Feed> feed(@RequestParam(defaultValue="SUBCULTURE") String category) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(service.feed(category));
    }
    @GetMapping("/api/admin/goods-showcase")
    public Map<String,Object> candidates(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size){return service.candidates(q,page,size);}
    @PutMapping("/api/admin/goods-showcase/{productId}")
    public Map<String,Object> update(@PathVariable long productId,@RequestBody GoodsShowcaseService.SettingInput input) {
        return service.setting(productId,input);
    }
}
