package com.boothhana.upload;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;

public interface ImageUploadRepository extends JpaRepository<ImageUpload, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from ImageUpload u where u.id = :id and u.ownerId = :owner")
    Optional<ImageUpload> findOwnedForUpdate(@Param("id") UUID id, @Param("owner") Long owner);
    Optional<ImageUpload> findByObjectKeyAndOwnerIdAndState(String key, Long owner, ImageUpload.State state);
    long countByOwnerIdAndCreatedAtAfter(Long owner, Instant after);
    @Query("select coalesce(sum(u.fileSize), 0) from ImageUpload u where u.ownerId = :owner and u.createdAt > :after")
    long bytesSince(@Param("owner") Long owner, @Param("after") Instant after);
}
