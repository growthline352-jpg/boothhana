package com.boothhana.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "booth_notice")
public class BoothNotice {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "event_booth_id", nullable = false) public Long eventBoothId;
    @Column(nullable = false) public String title;
    @Column(nullable = false, columnDefinition = "text") public String body;
    @Column(name = "is_pinned", nullable = false) public boolean pinned;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
}
