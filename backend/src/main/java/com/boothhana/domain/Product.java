package com.boothhana.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "product")
public class Product {
    @Version @Column(nullable = false) public long version;
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "booth_id", nullable = false) public Long boothId;
    @Column(nullable = false) public String name;
    @Column(nullable = false, columnDefinition = "text") public String description = "";
    @Column(name = "image_key") public String imageKey;
}
