package com.boothhana.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "pos_sale_item")
public class PosSaleItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "pos_sale_id", nullable = false) public Long posSaleId;
    @Column(name = "event_product_id", nullable = false) public Long eventProductId;
    @Column(nullable = false) public int quantity;
    @Column(name = "unit_price", nullable = false) public long unitPrice;
}
