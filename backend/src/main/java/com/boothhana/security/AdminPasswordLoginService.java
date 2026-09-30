package com.boothhana.security;

import com.boothhana.api.ApiException;
import com.boothhana.domain.UserAccount;
import com.boothhana.repository.UserAccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminPasswordLoginService {
    private static final String SUBJECT_PREFIX = "local-admin:";
    private final UserAccountRepository users;
    private final String username;
    private final String passwordHash;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);

    public AdminPasswordLoginService(UserAccountRepository users,
            @Value("${app.admin-login.username:}") String username,
            @Value("${app.admin-login.password-hash:}") String passwordHash) {
        this.users = users;
        this.username = username == null ? "" : username.strip();
        this.passwordHash = passwordHash == null ? "" : passwordHash.strip();
        if (this.username.isBlank() != this.passwordHash.isBlank()) {
            throw new IllegalStateException("ADMIN_LOGIN_USERNAME and ADMIN_LOGIN_PASSWORD_HASH must be configured together");
        }
        if (!this.passwordHash.isBlank() && !this.passwordHash.matches("^\\$2[aby]\\$12\\$.{53}$")) {
            throw new IllegalStateException("ADMIN_LOGIN_PASSWORD_HASH must be a bcrypt strength-12 hash");
        }
    }

    @Transactional
    public UserAccount authenticate(String submittedUsername, String submittedPassword) {
        if (username.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "ADMIN_LOGIN_NOT_CONFIGURED", "관리자 로그인이 아직 설정되지 않았습니다.");
        }
        // Always run the adaptive password check so a wrong ID does not become a cheap oracle.
        boolean passwordMatches = passwords.matches(submittedPassword, passwordHash);
        if (!passwordMatches || !username.equals(submittedUsername)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_ADMIN_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
        }
        String subject = SUBJECT_PREFIX + username;
        UserAccount admin = users.findByKakaoSubject(subject).orElseGet(UserAccount::new);
        admin.kakaoSubject = subject;
        if (!admin.customDisplayName) admin.displayName = "관리자";
        return users.save(admin);
    }
}
