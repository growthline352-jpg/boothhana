package com.boothhana.api;

import com.boothhana.api.ApiModels.*;
import com.boothhana.domain.UserAccount;
import com.boothhana.security.CurrentUser;
import com.boothhana.service.PlatformService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/creator")
public class CreatorController {
    private final PlatformService service; private final CurrentUser current;
    public CreatorController(PlatformService service, CurrentUser current) { this.service = service; this.current = current; }
    @GetMapping("/events") public List<EventView> events(Authentication auth, @RequestParam(required = false) Long boothId) { return service.creatorEvents(user(auth), boothId); }
    @GetMapping("/booths") public List<BoothView> booths(Authentication auth) { return service.creatorBooths(user(auth)); }
    @GetMapping("/event-booths") public List<BoothView> eventBooths(Authentication auth) { return service.creatorEventBooths(user(auth)); }
    @PatchMapping("/event-booths/{id}") public BoothView updateEventBooth(Authentication auth, @PathVariable Long id, @Valid @RequestBody EventBoothInput input) { return service.updateEventBooth(user(auth), id, input); }
    @DeleteMapping("/event-booths/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteEventBooth(Authentication auth, @PathVariable Long id) { service.deleteEventBooth(user(auth), id); }
    @PostMapping("/booths") @ResponseStatus(HttpStatus.CREATED) public BoothView createBooth(Authentication auth, @Valid @RequestBody BoothInput input) { return service.createBooth(user(auth), input); }
    @PatchMapping("/booths/{id}") public BoothView updateBooth(Authentication auth, @PathVariable Long id, @Valid @RequestBody BoothInput input) { return service.updateBooth(user(auth), id, input); }
    @DeleteMapping("/booths/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteBooth(Authentication auth, @PathVariable Long id) { service.deleteBooth(user(auth), id); }
    @GetMapping("/event-booths/{id}/products") public List<ProductView> products(Authentication auth, @PathVariable Long id) { return service.creatorProducts(user(auth), id); }
    @PostMapping("/event-booths/{id}/products") public ProductView createProduct(Authentication auth, @PathVariable Long id, @Valid @RequestBody ProductInput input) { return service.createProduct(user(auth), id, input); }
    @PatchMapping("/products/{id}") public ProductView updateProduct(Authentication auth, @PathVariable Long id, @Valid @RequestBody ProductInput input) { return service.updateProduct(user(auth), id, input); }
    @DeleteMapping("/products/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteProduct(Authentication auth, @PathVariable Long id) { service.deleteProduct(user(auth), id); }
    @PostMapping("/event-booths/{id}/products/copy") public List<ProductView> copyProducts(Authentication auth, @PathVariable Long id, @RequestBody CopyProductsInput input) { return service.copyProducts(user(auth), id, input); }
    @GetMapping("/event-booths/{id}/notices") public List<NoticeView> notices(Authentication auth, @PathVariable Long id) { return service.creatorNotices(user(auth), id); }
    @PostMapping("/event-booths/{id}/notices") public NoticeView createNotice(Authentication auth, @PathVariable Long id, @Valid @RequestBody NoticeInput input) { return service.createNotice(user(auth), id, input); }
    @PatchMapping("/notices/{id}") public NoticeView updateNotice(Authentication auth, @PathVariable Long id, @Valid @RequestBody NoticeInput input) { return service.updateNotice(user(auth), id, input); }
    @PostMapping("/notices/{id}/pin") public NoticeView pinNotice(Authentication auth, @PathVariable Long id) { return service.pinNotice(user(auth), id); }
    @DeleteMapping("/notices/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteNotice(Authentication auth, @PathVariable Long id) { service.deleteNotice(user(auth), id); }
    @GetMapping("/reservations") public List<ReservationView> reservations(Authentication auth) { return service.creatorReservations(user(auth)); }
    @GetMapping("/reservations/by-number/{number}") public ReservationView reservation(Authentication auth, @PathVariable String number) { return service.creatorReservationByNumber(user(auth), number); }
    @PostMapping("/reservations/{id}/pickup") public ReservationView pickup(Authentication auth, @PathVariable Long id) { return service.pickup(user(auth), id); }
    @GetMapping("/pos-requests/{requestId}") public org.springframework.http.ResponseEntity<java.util.Map<String,Object>> receipt(Authentication auth,@PathVariable java.util.UUID requestId) { return org.springframework.http.ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(service.posReceipt(user(auth),requestId)); }
    @GetMapping("/pos-sales") public List<PosView> posSales(Authentication auth) { return service.posSales(user(auth)); }
    @GetMapping("/pos-sales/{id}") public PosView posSale(Authentication auth, @PathVariable Long id) { return service.posSale(user(auth), id); }
    @PostMapping("/pos-sales") public PosView createPos(Authentication auth, @Valid @RequestBody PosInput input) { return service.createPos(user(auth), input); }
    @PostMapping("/pos-sales/{id}/cancel") public PosView cancelPos(Authentication auth, @PathVariable Long id) { return service.cancelPos(user(auth), id); }
    private UserAccount user(Authentication auth) { return current.require(auth); }
}
