package com.boothhana.domain;

import com.boothhana.domain.DomainEnums.StockMode;
import jakarta.persistence.*;

@Entity
@Table(name = "event_product")
public class EventProduct {
    @Version @Column(nullable = false) public long version;
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "event_booth_id", nullable = false) public Long eventBoothId;
    @Column(name = "product_id", nullable = false) public Long productId;
    @Column(nullable = false) public long price;
    @Enumerated(EnumType.STRING) @Column(name = "stock_mode", nullable = false) public StockMode stockMode = StockMode.FINITE;
    @Column(name = "stock_quantity") public Integer stockQuantity;
    @Column(name = "is_sold_out", nullable = false) public boolean soldOut;
    @Column(name = "is_public", nullable = false) public boolean isPublic = true;
    @Column(name = "reservation_enabled", nullable = false) public boolean reservationEnabled = true;
}
