package com.boothhana.security;

import jakarta.servlet.http.HttpSession;

/** Kakao members keep a sliding session; operator/password sessions remain short-lived. */
public final class LoginSessionPolicy {
    private LoginSessionPolicy() {}
    public static final String PERSISTENT_KAKAO = "BOOTH_PERSISTENT_KAKAO";
    public static final int MEMBER_SECONDS = 30 * 24 * 60 * 60;
    public static final int ADMIN_SECONDS = 30 * 60;

    public static void kakao(HttpSession session) {
        session.setMaxInactiveInterval(MEMBER_SECONDS);
        session.setAttribute(PERSISTENT_KAKAO, Boolean.TRUE);
    }

    public static void admin(HttpSession session) {
        session.removeAttribute(PERSISTENT_KAKAO);
        session.setMaxInactiveInterval(ADMIN_SECONDS);
    }
}
