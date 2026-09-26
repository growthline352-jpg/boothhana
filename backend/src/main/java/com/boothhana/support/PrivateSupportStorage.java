package com.boothhana.support;
import com.boothhana.api.ApiException;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.checksums.*;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.apache.ApacheHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
import java.net.URI;
import java.time.Duration;
import java.util.Map;

/** Dedicated PRIVATE bucket, never R2_PUBLIC_URL or the public-image bucket. */
@Component
public class PrivateSupportStorage {
 private final String account,key,secret,bucket,publicBucket;private final boolean enabled;private S3Client s3;
 public PrivateSupportStorage(@Value("${app.r2.account-id:}")String account,@Value("${app.r2.access-key:}")String key,
     @Value("${app.r2.secret-key:}")String secret,@Value("${app.support.private-bucket:}")String bucket,
     @Value("${app.r2.bucket:}")String publicBucket,@Value("${app.support.attachments-enabled:false}")boolean enabled){
  this.account=account;this.key=key;this.secret=secret;this.bucket=bucket;this.publicBucket=publicBucket;this.enabled=enabled;
 }
 public boolean available(){return enabled&&!bucket.isBlank()&&!bucket.equals(publicBucket)&&!account.isBlank()&&!key.isBlank()&&!secret.isBlank();}
 private synchronized S3Client client(){
  if(!available())throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PRIVATE_ATTACHMENTS_DISABLED","비공개 첨부 저장소가 준비되지 않았습니다. 첨부 없이 접수할 수 있습니다.");
  if(s3==null)s3=S3Client.builder().endpointOverride(URI.create("https://"+account+".r2.cloudflarestorage.com"))
   .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(key,secret))).region(Region.of("auto"))
   .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).chunkedEncodingEnabled(false).build())
   .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED).responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
   .httpClientBuilder(ApacheHttpClient.builder().connectionTimeout(Duration.ofSeconds(5)).connectionAcquisitionTimeout(Duration.ofSeconds(5)).socketTimeout(Duration.ofSeconds(15)).maxConnections(8))
   .overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(40)).apiCallAttemptTimeout(Duration.ofSeconds(20))).build();
  return s3;
 }
 public void put(String objectKey,String type,byte[] data,String digest){
  try{client().putObject(PutObjectRequest.builder().bucket(bucket).key(objectKey).contentType(type).cacheControl("private, no-store").contentLength((long)data.length).metadata(Map.of("sha256",digest)).build(),RequestBody.fromBytes(data));}
  catch(software.amazon.awssdk.core.exception.SdkException e){throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PRIVATE_STORAGE_ERROR","첨부 저장 실패. 접수 내역은 유지되며 같은 파일로 다시 시도할 수 있습니다.");}
 }
 public byte[] get(String objectKey,long size,String digest){
  // Bounded stream even if bucket contents were changed out of band.
  try(var stream=client().getObject(GetObjectRequest.builder().bucket(bucket).key(objectKey).build())){
   byte[] b=stream.readNBytes(Math.toIntExact(size+1));
   String actual=java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(b));
   if(b.length!=size||!actual.equals(digest))throw ApiException.conflict("첨부 파일 검증값이 다릅니다.");return b;
  }catch(java.io.IOException|java.security.NoSuchAlgorithmException|software.amazon.awssdk.core.exception.SdkException e){throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PRIVATE_STORAGE_ERROR","첨부를 불러오지 못했습니다.");}
 }
 @PreDestroy public synchronized void close(){if(s3!=null){s3.close();s3=null;}}
}
