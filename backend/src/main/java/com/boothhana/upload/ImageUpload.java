package com.boothhana.upload;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "image_upload")
public class ImageUpload {
    public enum State { REGISTERED, STORED, COMPLETE }
    @Id public UUID id;
    @Column(name = "owner_id", nullable = false) public Long ownerId;
    @Column(nullable = false, length = 16) public String target;
    @Column(name = "content_type", nullable = false, length = 64) public String contentType;
    @Column(name = "file_size", nullable = false) public long fileSize;
    @Column(nullable = false, length = 64) public String sha256;
    @Column(name = "object_key", nullable = false, unique = true, length = 512) public String objectKey;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) public State state = State.REGISTERED;
    @Column(name = "created_at", nullable = false) public Instant createdAt;
    @Column(name = "expires_at", nullable = false) public Instant expiresAt;
    @Column(name = "completed_at") public Instant completedAt;
}
