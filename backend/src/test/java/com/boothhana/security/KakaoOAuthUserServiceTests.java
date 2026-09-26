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
        var service = new KakaoOAuthUserService(mock(UserAccountRepository.class));

        assertThat(service.authorities())
            .extracting(authority -> authority.getAuthority())
            .containsExactly("ROLE_FAN", "ROLE_CREATOR");
    }
}
