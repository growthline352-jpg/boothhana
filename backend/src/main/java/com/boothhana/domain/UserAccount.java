package com.boothhana.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "app_user")
public class UserAccount {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "kakao_subject", nullable = false, unique = true) public String kakaoSubject;
    @Column(name = "display_name", nullable = false) public String displayName;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
}
