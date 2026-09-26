package com.boothhana.upload;

import com.boothhana.api.ApiException;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import com.google.cloud.storage.StorageOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.Map;

/** Google Cloud Storage adapter for verified public images. */
@Component
public class GcsImageStorage implements VerifiedImageStorage {
    private final String projectId;
    private final String bucket;
    private volatile Storage storage;

    @Autowired
    public GcsImageStorage(
            @Value("${app.gcs.project-id:}") String projectId,
            @Value("${app.gcs.public-bucket:}") String bucket) {
        this.projectId = projectId;
        this.bucket = bucket;
    }

    GcsImageStorage(String projectId, String bucket, Storage storage) {
        this.projectId = projectId;
        this.bucket = bucket;
        this.storage = storage;
    }

    private synchronized Storage client() {
        if (storage != null) return storage;
        if (projectId.isBlank() || bucket.isBlank())
            throw unavailable("GCS 환경변수가 아직 설정되지 않았습니다.");
        try {
            storage = StorageOptions.newBuilder().setProjectId(projectId).build().getService();
            return storage;
        } catch (RuntimeException error) {
            throw unavailable("GCS 인증 정보를 불러오지 못했습니다.");
        }
    }

    @Override
    public void put(String key, String type, byte[] bytes, String digest) {
        BlobInfo info = BlobInfo.newBuilder(BlobId.of(bucket, key))
            .setContentType(type)
            .setCacheControl("public, max-age=31536000, immutable")
            .setMetadata(Map.of("sha256", digest))
            .build();
        try {
            client().create(info, bytes, Storage.BlobTargetOption.doesNotExist());
        } catch (StorageException error) {
            // A lost DB/HTTP response can retry the same immutable object key.
            if (error.getCode() == 412) {
                verify(key, type, bytes.length, digest);
                return;
            }
            throw unavailable("이미지 저장소 요청이 실패했습니다. 같은 업로드를 다시 시도해 주세요.");
        }
    }

    @Override
    public void verify(String key, String type, long size, String digest) {
        try {
            Blob blob = client().get(BlobId.of(bucket, key));
            if (blob == null) throw ApiException.conflict("저장된 이미지가 없습니다. 같은 업로드를 다시 시도해 주세요.");
            Map<String, String> metadata = blob.getMetadata();
            if (blob.getSize() != size || !type.equals(blob.getContentType())
                    || metadata == null || !digest.equals(metadata.get("sha256")))
                throw ApiException.conflict("저장된 이미지의 검증 정보가 일치하지 않습니다. 다시 업로드해 주세요.");
        } catch (StorageException error) {
            throw unavailable("이미지 저장소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
    }

    private ApiException unavailable(String message) {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GCS_UNAVAILABLE", message);
    }
}
