package com.boothhana.upload;

import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.*;
import com.boothhana.repository.UserAccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.io.InputStream;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Server-mediated bounded uploads; no presigned browser PUT bypass is left enabled. */
@Service
@Transactional
public class R2UploadService {
    private final ImageUploadRepository uploads;
    private final UserAccountRepository users;
    private final VerifiedImageStorage storage;
    private final int maxPerHour;
    private final long maxBytesPerDay;
    public R2UploadService(ImageUploadRepository uploads, UserAccountRepository users, VerifiedImageStorage storage,
            @Value("${app.upload.max-per-hour:20}") int maxPerHour,
            @Value("${app.upload.max-bytes-per-day:104857600}") long maxBytesPerDay) {
        if (maxPerHour < 1 || maxBytesPerDay < ImageUploadRules.MAX_BYTES) throw new IllegalArgumentException("Invalid upload quotas");
        this.uploads = uploads; this.users = users; this.storage = storage;
        this.maxPerHour = maxPerHour; this.maxBytesPerDay = maxBytesPerDay;
    }
    public UploadTicketView register(Long owner, UploadTicketInput input) {
        try {
            ImageUploadRules.validateOwnerAndTarget(owner, input.target());
            ImageUploadRules.validateSize(input.fileSize());
            ImageUploadRules.extension(input.contentType());
            ImageUploadRules.validateDigest(input.sha256());
            Objects.requireNonNull(input.uploadId());
        } catch (IllegalArgumentException | NullPointerException error) { throw ApiException.badRequest("이미지 업로드 정보를 확인해 주세요."); }
        // One owner lock serializes quota checks AND idempotent registration, including across instances.
        users.lockUploadOwner(owner).orElseThrow(() -> ApiException.forbidden("사용자 정보를 확인하지 못했습니다."));
        var previous = uploads.findById(input.uploadId());
        if (previous.isPresent()) {
            var value = previous.get();
            if (!Objects.equals(value.ownerId, owner)) throw ApiException.conflict("사용할 수 없는 업로드 ID입니다.");
            if (!value.target.equals(input.target()) || !value.contentType.equals(input.contentType())
                    || value.fileSize != input.fileSize() || !value.sha256.equals(input.sha256()))
                throw ApiException.conflict("같은 업로드 ID에 다른 파일을 사용할 수 없습니다.");
            return view(value);
        }
        Instant now = Instant.now();
        if (uploads.countByOwnerIdAndCreatedAtAfter(owner, now.minusSeconds(3600)) >= maxPerHour
                || uploads.bytesSince(owner, now.minusSeconds(86400)) > maxBytesPerDay - input.fileSize())
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "UPLOAD_QUOTA", "이미지 업로드 한도를 초과했습니다. 나중에 다시 시도해 주세요.");
        var value = new ImageUpload(); value.id = input.uploadId(); value.ownerId = owner;
        value.target = input.target(); value.contentType = input.contentType(); value.fileSize = input.fileSize(); value.sha256 = input.sha256();
        value.objectKey = "verified/" + value.target + "/" + owner + "/" + UUID.randomUUID() + ImageUploadRules.extension(value.contentType);
        value.createdAt = now; value.expiresAt = now.plusSeconds(1800);
        return view(uploads.saveAndFlush(value));
    }
    public void upload(Long owner, UUID id, String contentType, long declaredLength, InputStream input) {
        var value = owned(owner, id);
        if (value.state == ImageUpload.State.COMPLETE || value.state == ImageUpload.State.STORED) return;
        if (!Instant.now().isBefore(value.expiresAt)) throw ApiException.conflict("업로드 시간이 만료되었습니다. 파일을 다시 선택해 주세요.");
        if (!value.contentType.equals(contentType) || (declaredLength >= 0 && declaredLength != value.fileSize))
            throw ApiException.badRequest("업로드한 파일의 형식 또는 크기가 요청과 다릅니다.");
        final byte[] bytes;
        try { bytes = ImageUploadRules.readVerified(input, value.fileSize, value.contentType, value.sha256); }
        catch (java.io.IOException | IllegalArgumentException error) { throw ApiException.badRequest(error.getMessage()); }
        // No object is written before actual bytes, size, magic bytes and digest are verified.
        // Retried/rolled-back writes use the same key and the same digest; they cannot replace a different image.
        storage.put(value.objectKey, value.contentType, bytes, value.sha256);
        value.state = ImageUpload.State.STORED; uploads.saveAndFlush(value);
    }
    public UploadCompleteView complete(Long owner, UUID id) {
        var value = owned(owner, id);
        if (value.state == ImageUpload.State.COMPLETE) return new UploadCompleteView(value.objectKey);
        // Also recovers a successful object write followed by a lost database commit/HTTP response.
        storage.verify(value.objectKey, value.contentType, value.fileSize, value.sha256);
        value.state = ImageUpload.State.COMPLETE; value.completedAt = Instant.now(); uploads.saveAndFlush(value);
        return new UploadCompleteView(value.objectKey);
    }
    @Transactional(readOnly = true)
    public void requireVerified(Long owner, String target, String key) {
        try { ImageUploadRules.validateFinalKey(owner, target, key); }
        catch (IllegalArgumentException error) { throw ApiException.badRequest(error.getMessage()); }
        var value = uploads.findByObjectKeyAndOwnerIdAndState(key, owner, ImageUpload.State.COMPLETE)
            .orElseThrow(() -> ApiException.badRequest("검증 완료된 본인 이미지 파일만 저장할 수 있습니다."));
        if (!target.equals(value.target)) throw ApiException.badRequest("이미지 용도가 일치하지 않습니다.");
        storage.verify(value.objectKey, value.contentType, value.fileSize, value.sha256);
    }
    private ImageUpload owned(Long owner, UUID id) {
        return uploads.findOwnedForUpdate(id, owner).orElseThrow(() -> ApiException.notFound("업로드 요청을 찾을 수 없습니다."));
    }
    private UploadTicketView view(ImageUpload value) { return new UploadTicketView(value.id, value.state.name()); }
}
