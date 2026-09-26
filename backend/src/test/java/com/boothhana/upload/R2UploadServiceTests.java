package com.boothhana.upload;

import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.UploadTicketInput;
import com.boothhana.domain.UserAccount;
import com.boothhana.repository.UserAccountRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.io.*;
import java.time.Instant;
import java.security.MessageDigest;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

/** Service tests with mocked storage and repositories. No real R2 call. */
class R2UploadServiceTests {
    final ImageUploadRepository uploads = mock(ImageUploadRepository.class);
    final UserAccountRepository users = mock(UserAccountRepository.class);
    final VerifiedImageStorage storage = mock(VerifiedImageStorage.class);
    final R2UploadService service = new R2UploadService(uploads, users, storage, 20, 104857600);
    final UUID id = UUID.randomUUID();
    final byte[] png = {(byte)137,80,78,71,13,10,26,10};
    String digest;
    @BeforeEach void setup() throws Exception {
        digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(png));
        var owner = new UserAccount(); owner.id = 42L;
        when(users.lockUploadOwner(42L)).thenReturn(Optional.of(owner));
        when(uploads.saveAndFlush(any(ImageUpload.class))).thenAnswer(call -> call.getArgument(0));
    }
    ImageUpload ticket() {
        var value = new ImageUpload(); value.id=id; value.ownerId=42L; value.target="product";
        value.fileSize=png.length; value.sha256=digest; value.contentType="image/png";
        value.objectKey="verified/product/42/12345678-1234-1234-1234-123456789abc.png";
        value.createdAt=Instant.now(); value.expiresAt=Instant.now().plusSeconds(1800);
        when(uploads.findOwnedForUpdate(id,42L)).thenReturn(Optional.of(value));
        return value;
    }
    UploadTicketInput input() { return new UploadTicketInput(id,"product","image/png",png.length,digest); }
    @Test void repeatedRegistrationReturnsSameTicketWithoutChargingQuotaAgain() {
        var value=ticket(); when(uploads.findById(id)).thenReturn(Optional.of(value));
        assertThat(service.register(42L,input()).uploadId()).isEqualTo(id);
        verify(uploads,never()).saveAndFlush(any());
        verify(uploads,never()).countByOwnerIdAndCreatedAtAfter(any(),any());
    }
    @Test void sameIdCannotBeReusedForAnotherFile() {
        var value=ticket(); when(uploads.findById(id)).thenReturn(Optional.of(value));
        var changed = new UploadTicketInput(id,"booth","image/png",png.length,digest);
        assertThatThrownBy(()->service.register(42L,changed)).isInstanceOf(ApiException.class);
    }
    @Test void rejectsHourlyQuota() {
        when(uploads.countByOwnerIdAndCreatedAtAfter(eq(42L),any())).thenReturn(20L);
        assertThatThrownBy(()->service.register(42L,input())).isInstanceOf(ApiException.class);
        verify(uploads,never()).saveAndFlush(any());
    }
    @Test void rejectsDailyByteQuota() {
        when(uploads.bytesSince(eq(42L),any())).thenReturn(104857600L);
        assertThatThrownBy(()->service.register(42L,input())).isInstanceOf(ApiException.class);
    }
    @Test void falseLengthCannotWriteOversizedBytesToStorage() {
        ticket(); byte[] longer=Arrays.copyOf(png,png.length+1);
        assertThatThrownBy(()->service.upload(42L,id,"image/png",-1,new ByteArrayInputStream(longer)))
            .isInstanceOf(ApiException.class);
        verifyNoInteractions(storage);
    }
    @Test void matchingLengthButInvalidSignatureIsRejectedBeforeStorage() {
        ticket();
        assertThatThrownBy(()->service.upload(42L,id,"image/png",png.length,new ByteArrayInputStream(new byte[png.length])))
            .isInstanceOf(ApiException.class);
        verifyNoInteractions(storage);
    }
    @Test void uploadedBytesAreVerifiedAndCompletedOnlyOnce() {
        var value=ticket();
        service.upload(42L,id,"image/png",png.length,new ByteArrayInputStream(png));
        assertThat(value.state).isEqualTo(ImageUpload.State.STORED);
        assertThat(service.complete(42L,id).objectKey()).isEqualTo(value.objectKey);
        assertThat(service.complete(42L,id).objectKey()).isEqualTo(value.objectKey);
        verify(storage,times(1)).put(eq(value.objectKey),eq("image/png"),any(),eq(digest));
        verify(storage,times(1)).verify(value.objectKey,"image/png",png.length,digest);
    }
    @Test void repeatedContentCannotOverwriteACompletedImage() {
        var value=ticket();value.state=ImageUpload.State.COMPLETE;
        service.upload(42L,id,"image/png",999,new ByteArrayInputStream(new byte[0]));
        verifyNoInteractions(storage);
    }
    @Test void completeRecoversPutSuccessFollowedByDatabaseRollback() {
        var value=ticket(); // REGISTERED in DB, valid immutable bytes already in R2.
        assertThat(service.complete(42L,id).objectKey()).isEqualTo(value.objectKey);
        assertThat(value.state).isEqualTo(ImageUpload.State.COMPLETE);
        verify(storage).verify(value.objectKey,value.contentType,value.fileSize,value.sha256);
    }
    @Test void unverifiedOrMissingReceiptCannotBeSaved() {
        var value=ticket();
        assertThatThrownBy(()->service.requireVerified(42L,"product",value.objectKey)).isInstanceOf(ApiException.class);
        verifyNoInteractions(storage);
    }
    @Test void verifiedReceiptStillChecksActualObjectExistence() {
        var value=ticket();value.state=ImageUpload.State.COMPLETE;
        when(uploads.findByObjectKeyAndOwnerIdAndState(value.objectKey,42L,ImageUpload.State.COMPLETE)).thenReturn(Optional.of(value));
        doThrow(ApiException.conflict("missing")).when(storage).verify(value.objectKey,value.contentType,value.fileSize,value.sha256);
        assertThatThrownBy(()->service.requireVerified(42L,"product",value.objectKey)).hasMessage("missing");
    }
    @Test void anotherUsersTicketIsNotAccessible() {
        ticket();assertThatThrownBy(()->service.complete(43L,id)).isInstanceOf(ApiException.class);
        verifyNoInteractions(storage);
    }
}
