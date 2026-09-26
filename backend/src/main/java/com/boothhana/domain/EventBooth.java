package com.boothhana.domain;

import com.boothhana.domain.DomainEnums.ApplicationStatus;
import jakarta.persistence.*;

@Entity
@Table(name = "event_booth", uniqueConstraints = @UniqueConstraint(columnNames = {"event_id", "booth_id"}))
public class EventBooth {
    @Version @Column(nullable = false) public long version;
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) public Long id;
    @Column(name = "event_id", nullable = false) public Long eventId;
    @Column(name = "booth_id", nullable = false) public Long boothId;
    @Column(name = "booth_number") public String boothNumber;
    @Column(nullable = false, columnDefinition = "text") public String intro = "";
    @Enumerated(EnumType.STRING) @Column(nullable = false) public ApplicationStatus status = ApplicationStatus.PENDING;
    @Column(name = "is_public", nullable = false) public boolean isPublic;
    @Column(name = "rejection_reason") public String rejectionReason;
}
