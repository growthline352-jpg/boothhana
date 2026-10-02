package com.boothhana.api;

import com.boothhana.security.AdminPasswordLoginService;
import com.boothhana.support.SupportRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.web.csrf.CsrfToken;
import java.net.URI;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AdminPasswordLoginService adminLogin;
    private final SupportRateLimiter rateLimiter;
    private final HttpSessionSecurityContextRepository securityContexts = new HttpSessionSecurityContextRepository();

    public AuthController(AdminPasswordLoginService adminLogin, SupportRateLimiter rateLimiter) {
        this.adminLogin = adminLogin;
        this.rateLimiter = rateLimiter;
    }

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

    @PostMapping("/admin/login")
    ResponseEntity<Void> adminLogin(@Valid @RequestBody AdminLoginInput input,
            HttpServletRequest request, HttpServletResponse response) {
        int attempts = rateLimiter.hit("admin-login:" + request.getRemoteAddr());
        if (attempts > 30) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "ADMIN_LOGIN_RATE_LIMIT", "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
        }
        var admin = adminLogin.authenticate(input.username().strip(), input.password());
        var authentication = UsernamePasswordAuthenticationToken.authenticated(
            admin.kakaoSubject, null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        if (request.getSession(false) != null) request.changeSessionId();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContexts.saveContext(context, request, response);
        com.boothhana.security.LoginSessionPolicy.admin(request.getSession(true));
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    public record AdminLoginInput(
        @NotBlank @Size(max = 100) String username,
        @NotBlank @Size(max = 128) String password
    ) {}
}
