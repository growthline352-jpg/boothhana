package com.boothhana.support;

import com.boothhana.api.ApiException;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import com.google.cloud.storage.StorageOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;

/** Dedicated private GCS bucket; objects are returned only through authorized API downloads. */
@Component
public class PrivateSupportStorage {
    private final String projectId;
    private final String bucket;
    private final String publicBucket;
    private final boolean enabled;
    private volatile Storage storage;

    public PrivateSupportStorage(
            @Value("${app.gcs.project-id:}") String projectId,
            @Value("${app.support.private-bucket:}") String bucket,
            @Value("${app.gcs.public-bucket:}") String publicBucket,
            @Value("${app.support.attachments-enabled:false}") boolean enabled) {
        this.projectId = projectId;
        this.bucket = bucket;
        this.publicBucket = publicBucket;
        this.enabled = enabled;
    }

    public boolean available() {
        return enabled && !projectId.isBlank() && !bucket.isBlank() && !bucket.equals(publicBucket);
    }

    private synchronized Storage client() {
        if (!available()) throw unavailable("비공개 첨부 저장소가 준비되지 않았습니다. 첨부 없이 접수할 수 있습니다.");
        if (storage != null) return storage;
        try {
            storage = StorageOptions.newBuilder().setProjectId(projectId).build().getService();
            return storage;
        } catch (RuntimeException error) {
            throw unavailable("비공개 첨부 저장소 인증 정보를 불러오지 못했습니다.");
        }
    }

    public void put(String objectKey, String type, byte[] data, String digest) {
        BlobInfo info = BlobInfo.newBuilder(BlobId.of(bucket, objectKey))
            .setContentType(type)
            .setCacheControl("private, no-store")
            .setMetadata(Map.of("sha256", digest))
            .build();
        try {
            client().create(info, data, Storage.BlobTargetOption.doesNotExist());
        } catch (StorageException error) {
            if (error.getCode() == 412) {
                verifyMetadata(objectKey, data.length, digest);
                return;
            }
            throw unavailable("첨부 저장 실패. 접수 내역은 유지되며 같은 파일로 다시 시도할 수 있습니다.");
        }
    }

    public byte[] get(String objectKey, long size, String digest) {
        try {
            Blob blob = verifyMetadata(objectKey, size, digest);
            byte[] bytes = blob.getContent();
            if (bytes.length != size || !sha256(bytes).equals(digest))
                throw ApiException.conflict("첨부 파일 검증값이 다릅니다.");
            return bytes;
        } catch (StorageException error) {
            throw unavailable("첨부를 불러오지 못했습니다.");
        }
    }

    private Blob verifyMetadata(String objectKey, long size, String digest) {
        Blob blob = client().get(BlobId.of(bucket, objectKey));
        Map<String, String> metadata = blob == null ? null : blob.getMetadata();
        if (blob == null || blob.getSize() != size || metadata == null || !digest.equals(metadata.get("sha256")))
            throw ApiException.conflict("첨부 파일 검증값이 다릅니다.");
        return blob;
    }

    private String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private ApiException unavailable(String message) {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PRIVATE_STORAGE_ERROR", message);
    }
}
