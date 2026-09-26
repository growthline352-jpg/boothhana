package com.boothhana.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "reservation_item")
public class ReservationItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "reservation_id", nullable = false) public Long reservationId;
    @Column(name = "event_product_id", nullable = false) public Long eventProductId;
    @Column(nullable = false) public int quantity;
    @Column(name = "unit_price", nullable = false) public long unitPrice;
}
