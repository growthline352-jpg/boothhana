package com.boothhana.domain;

import com.boothhana.domain.DomainEnums.EventStatus;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "event")
public class Event {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(nullable = false) public String name;
    @Column(name = "start_at", nullable = false) public Instant startAt;
    @Column(name = "end_at", nullable = false) public Instant endAt;
    @Column(nullable = false) public String venue;
    @Column(nullable = false, columnDefinition = "text") public String description = "";
    @Column(name = "image_key") public String imageKey;
    @Column(name = "reservation_start_at") public Instant reservationStartAt;
    @Column(name = "reservation_end_at") public Instant reservationEndAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public EventStatus status = EventStatus.DRAFT;
}
