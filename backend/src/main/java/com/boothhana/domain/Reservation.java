package com.boothhana.domain;

import com.boothhana.domain.DomainEnums.ReservationStatus;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "reservation")
public class Reservation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "reservation_no", nullable = false, unique = true) public String reservationNo;
    @Column(name = "user_id", nullable = false) public Long userId;
    @Column(name = "event_booth_id", nullable = false) public Long eventBoothId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public ReservationStatus status = ReservationStatus.RESERVED;
    @Column(name = "qr_token", nullable = false) public String qrToken;
    @Column(name = "created_at", nullable = false) public Instant createdAt = Instant.now();
    @Column(name = "picked_up_at") public Instant pickedUpAt;
    @Column(name = "canceled_at") public Instant canceledAt;
}
