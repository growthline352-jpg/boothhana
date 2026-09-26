package com.boothhana.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "booth")
public class Booth {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "owner_user_id", nullable = false) public Long ownerUserId;
    @Column(nullable = false) public String name;
    @Column(nullable = false, columnDefinition = "text") public String description = "";
    @Column(name = "image_key") public String imageKey;
    @Column(name = "sns_url") public String snsUrl;
}
