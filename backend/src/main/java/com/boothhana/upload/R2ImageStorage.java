package com.boothhana.upload;

import com.boothhana.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.apache.ApacheHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
import java.net.URI;
import java.time.Duration;
import java.util.Map;

@Component
public class R2ImageStorage implements VerifiedImageStorage {
    private final String accountId, accessKey, secretKey, bucket;
    private volatile S3Client s3;
    public R2ImageStorage(@Value("${app.r2.account-id:}") String accountId,
            @Value("${app.r2.access-key:}") String accessKey,
            @Value("${app.r2.secret-key:}") String secretKey,
            @Value("${app.r2.bucket:}") String bucket) {
        this.accountId = accountId; this.accessKey = accessKey; this.secretKey = secretKey; this.bucket = bucket;
    }
    private synchronized S3Client client() {
        if (s3 != null) return s3;
        if (accountId.isBlank() || accessKey.isBlank() || secretKey.isBlank() || bucket.isBlank())
            throw unavailable("R2 환경변수가 아직 설정되지 않았습니다.");
        s3 = S3Client.builder().endpointOverride(URI.create("https://" + accountId + ".r2.cloudflarestorage.com"))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
            .region(Region.of("auto")).serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).chunkedEncodingEnabled(false).build())
            .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
            .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
            .httpClientBuilder(ApacheHttpClient.builder().connectionTimeout(Duration.ofSeconds(5))
                .connectionAcquisitionTimeout(Duration.ofSeconds(5)).socketTimeout(Duration.ofSeconds(15)).maxConnections(20))
            .overrideConfiguration(c -> c.apiCallTimeout(Duration.ofSeconds(40)).apiCallAttemptTimeout(Duration.ofSeconds(20)))
            .build();
        return s3;
    }
    public void put(String key, String type, byte[] bytes, String digest) {
        try {
            client().putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(type)
                .contentLength((long) bytes.length).metadata(Map.of("sha256", digest))
                .cacheControl("public, max-age=31536000, immutable").build(), RequestBody.fromBytes(bytes));
        } catch (S3Exception | SdkClientException error) { throw unavailable("이미지 저장소 요청이 실패했습니다. 같은 업로드를 다시 시도해 주세요."); }
    }
    public void verify(String key, String type, long size, String digest) {
        try {
            var head = client().headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            if (head.contentLength() != size || !type.equals(head.contentType()) || !digest.equals(head.metadata().get("sha256")))
                throw ApiException.conflict("저장된 이미지의 검증 정보가 일치하지 않습니다. 다시 업로드해 주세요.");
        } catch (S3Exception error) {
            if (error.statusCode() == 404) throw ApiException.conflict("저장된 이미지가 없습니다. 같은 업로드를 다시 시도해 주세요.");
            throw unavailable("이미지 저장소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } catch (SdkClientException error) { throw unavailable("이미지 저장소 응답 시간이 초과되었거나 연결하지 못했습니다."); }
    }
    private ApiException unavailable(String message) { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "R2_UNAVAILABLE", message); }
    @PreDestroy public synchronized void close() { if (s3 != null) { s3.close(); s3 = null; } }
}
