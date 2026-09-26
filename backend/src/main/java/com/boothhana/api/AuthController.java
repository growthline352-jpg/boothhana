package com.boothhana.api;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.web.csrf.CsrfToken;
import java.net.URI;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    @GetMapping("/csrf")
    Map<String, String> csrf(CsrfToken token) {
        return Map.of("token", token.getToken());
    }

    @GetMapping("/login")
    ResponseEntity<Void> login(jakarta.servlet.http.HttpServletRequest request,
            @RequestParam(required=false) String returnTo) {
        var session=request.getSession(true);
        session.setAttribute("BOOTH_RETURN_PATH",com.boothhana.security.LoginReturnPath.safe(returnTo));
        session.setAttribute("BOOTH_RETURN_UNTIL",System.currentTimeMillis()+600_000L);
        return login();
    }
    // Kept for existing direct unit test; not a second HTTP endpoint.
    ResponseEntity<Void> login() {
        return ResponseEntity.status(HttpStatus.FOUND).location(URI.create("/oauth2/authorization/kakao")).build();
    }
}
