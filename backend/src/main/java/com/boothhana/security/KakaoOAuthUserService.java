package com.boothhana.security;

import com.boothhana.domain.UserAccount;
import com.boothhana.repository.UserAccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.*;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
public class KakaoOAuthUserService extends DefaultOAuth2UserService {
    private final UserAccountRepository users;
    private final Set<String> adminSubjects;

    public KakaoOAuthUserService(UserAccountRepository users, @Value("${app.admin-kakao-subjects:}") String adminSubjects) {
        this.users = users;
        this.adminSubjects = Arrays.stream(adminSubjects.split(","))
            .map(String::trim)
            .filter(subject -> !subject.isBlank())
            .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    @Override @Transactional
    public OAuth2User loadUser(OAuth2UserRequest request) throws OAuth2AuthenticationException {
        OAuth2User kakao = super.loadUser(request);
        String subject = kakaoSubject(kakao.getAttribute("id"));
        UserAccount user = users.findByKakaoSubject(subject).orElseGet(UserAccount::new);
        user.kakaoSubject = subject;
        user.displayName = nickname(kakao.getAttributes());
        users.save(user);
        return new DefaultOAuth2User(authorities(subject), kakao.getAttributes(), "id");
    }

    static String kakaoSubject(Object id) {
        return Objects.toString(id, "");
    }

    @SuppressWarnings("unchecked")
    private String nickname(Map<String, Object> attributes) {
        Object properties = attributes.get("properties");
        if (properties instanceof Map<?, ?> values) return String.valueOf(((Map<String, Object>) values).getOrDefault("nickname", "BoothHana 사용자"));
        return "BoothHana 사용자";
    }

    List<SimpleGrantedAuthority> authorities(String subject) {
        List<SimpleGrantedAuthority> result = new ArrayList<>();
        result.add(new SimpleGrantedAuthority("ROLE_FAN"));
        result.add(new SimpleGrantedAuthority("ROLE_CREATOR"));
        if (adminSubjects.contains(subject)) result.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
        return result;
    }
}
