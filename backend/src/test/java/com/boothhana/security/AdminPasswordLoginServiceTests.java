package com.boothhana.security;

import com.boothhana.api.ApiException;
import com.boothhana.domain.UserAccount;
import com.boothhana.repository.UserAccountRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AdminPasswordLoginServiceTests {
    private final UserAccountRepository users = mock(UserAccountRepository.class);
    private final String hash = new BCryptPasswordEncoder(12).encode("correct horse battery staple");

    @Test
    void authenticatesAgainstHashAndCreatesSeparateAdminIdentity() {
        when(users.findByKakaoSubject("local-admin:operator")).thenReturn(Optional.empty());
        when(users.save(any(UserAccount.class))).thenAnswer(invocation -> {
            UserAccount user = invocation.getArgument(0); user.id = 17L; return user;
        });
        var service = new AdminPasswordLoginService(users, "operator", hash);

        UserAccount result = service.authenticate("operator", "correct horse battery staple");

        assertThat(result.kakaoSubject).isEqualTo("local-admin:operator");
        assertThat(result.displayName).isEqualTo("관리자");
    }

    @Test
    void rejectsWrongCredentialsWithoutTouchingAccountData() {
        var service = new AdminPasswordLoginService(users, "operator", hash);

        assertThatThrownBy(() -> service.authenticate("operator", "wrong password"))
            .isInstanceOfSatisfying(ApiException.class, error -> {
                assertThat(error.status.value()).isEqualTo(401);
                assertThat(error.code).isEqualTo("INVALID_ADMIN_CREDENTIALS");
            });
        verifyNoInteractions(users);
    }

    @Test
    void refusesPartialOrWeakDeploymentConfiguration() {
        assertThatThrownBy(() -> new AdminPasswordLoginService(users, "operator", ""))
            .isInstanceOf(IllegalStateException.class);
        String weak = new BCryptPasswordEncoder(10).encode("password");
        assertThatThrownBy(() -> new AdminPasswordLoginService(users, "operator", weak))
            .isInstanceOf(IllegalStateException.class);
    }
}
