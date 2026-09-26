package com.boothhana.domain;

import com.boothhana.domain.DomainEnums.PaymentMethod;
import com.boothhana.domain.DomainEnums.PosStatus;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "pos_sale")
public class PosSale {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "sale_no", nullable = false, unique = true) public String saleNo;
    @Column(name = "event_booth_id", nullable = false) public Long eventBoothId;
    @Enumerated(EnumType.STRING) @Column(name = "payment_method", nullable = false) public PaymentMethod paymentMethod;
    @Enumerated(EnumType.STRING) @Column(nullable = false) public PosStatus status = PosStatus.SOLD;
    @Column(name = "sold_at", nullable = false) public Instant soldAt = Instant.now();
}
