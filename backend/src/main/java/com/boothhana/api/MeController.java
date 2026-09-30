package com.boothhana.api;

import com.boothhana.api.ApiModels.*;
import com.boothhana.domain.UserAccount;
import com.boothhana.security.CurrentUser;
import com.boothhana.service.PlatformService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api")
public class MeController {
    private final PlatformService service; private final CurrentUser current;
    public MeController(PlatformService service, CurrentUser current) { this.service = service; this.current = current; }
    @GetMapping("/me") public UserView me(Authentication authentication) { return service.user(current.require(authentication), current.permissions(authentication)); }
    @PatchMapping("/me/profile") public UserView profile(Authentication authentication, @Valid @RequestBody ProfileInput input) {
        return service.updateProfile(current.require(authentication), current.permissions(authentication), input);
    }
    @GetMapping("/me/reservation-requests/{requestId}")
    public org.springframework.http.ResponseEntity<java.util.Map<String,Object>> receipt(Authentication auth,@PathVariable java.util.UUID requestId) {
        return org.springframework.http.ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(service.reservationReceipt(user(auth),requestId));
    }
    @GetMapping("/me/reservations") public List<ReservationView> reservations(Authentication auth) { return service.userReservations(user(auth)); }
    @PostMapping("/me/reservations") public ReservationView create(Authentication auth, @Valid @RequestBody ReservationInput input) { return service.createReservation(user(auth), input); }
    @GetMapping("/me/reservations/{id}") public ReservationView reservation(Authentication auth, @PathVariable Long id) { return service.userReservation(user(auth), id); }
    @PostMapping("/me/reservations/{id}/cancel") public ReservationView cancel(Authentication auth, @PathVariable Long id) { return service.cancelReservation(user(auth), id); }
    private UserAccount user(Authentication auth) { return current.require(auth); }
}
