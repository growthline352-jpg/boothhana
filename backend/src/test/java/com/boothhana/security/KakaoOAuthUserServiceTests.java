package com.boothhana.security;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.boothhana.repository.UserAccountRepository;

class KakaoOAuthUserServiceTests {
    @Test
    void convertsLongKakaoIdToString() {
        assertThat(KakaoOAuthUserService.kakaoSubject(123456789L)).isEqualTo("123456789");
    }

    @Test
    void convertsMissingKakaoIdToEmptyString() {
        assertThat(KakaoOAuthUserService.kakaoSubject(null)).isEmpty();
    }

    @Test
    void grantsFanAndCreatorPermissionsToEveryUser() {
        var service = new KakaoOAuthUserService(mock(UserAccountRepository.class), "admin-id");

        assertThat(service.authorities("normal-id"))
            .extracting(authority -> authority.getAuthority())
            .containsExactly("ROLE_FAN", "ROLE_CREATOR");
    }

    @Test
    void addsAdminPermissionForEachConfiguredKakaoSubject() {
        var service = new KakaoOAuthUserService(mock(UserAccountRepository.class), "first-admin, second-admin");

        assertThat(service.authorities("first-admin"))
            .extracting(authority -> authority.getAuthority())
            .containsExactly("ROLE_FAN", "ROLE_CREATOR", "ROLE_ADMIN");
        assertThat(service.authorities("second-admin"))
            .extracting(authority -> authority.getAuthority())
            .containsExactly("ROLE_FAN", "ROLE_CREATOR", "ROLE_ADMIN");
    }

    @Test
    void trimsConfiguredKakaoSubjectsAndIgnoresBlankEntries() {
        var service = new KakaoOAuthUserService(mock(UserAccountRepository.class), " first-admin, ,second-admin ");

        assertThat(service.authorities("second-admin"))
            .extracting(authority -> authority.getAuthority())
            .containsExactly("ROLE_FAN", "ROLE_CREATOR", "ROLE_ADMIN");
        assertThat(service.authorities(""))
            .extracting(authority -> authority.getAuthority())
            .containsExactly("ROLE_FAN", "ROLE_CREATOR");
    }
}
