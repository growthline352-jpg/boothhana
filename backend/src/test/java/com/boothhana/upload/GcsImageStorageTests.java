package com.boothhana.upload;

import com.boothhana.api.ApiException;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GcsImageStorageTests {
    private final Storage storage = mock(Storage.class);
    private final GcsImageStorage images = new GcsImageStorage("project", "public-bucket", storage);

    @Test
    void springCreatesComponentWithConfiguredConstructor() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("test", Map.of(
                "app.gcs.project-id", "project",
                "app.gcs.public-bucket", "public-bucket"
            )));
            context.register(GcsImageStorage.class);
            context.refresh();

            assertThat(context.getBean(GcsImageStorage.class)).isNotNull();
        }
    }

    @Test
    void createsImmutableObjectWithVerificationMetadata() {
        byte[] bytes = {1, 2, 3};
        images.put("verified/product/1/file.png", "image/png", bytes, "abc");

        verify(storage).create(argThat((BlobInfo info) ->
                info.getBlobId().getBucket().equals("public-bucket")
                    && info.getBlobId().getName().equals("verified/product/1/file.png")
                    && info.getContentType().equals("image/png")
                    && info.getCacheControl().contains("immutable")
                    && info.getMetadata().equals(Map.of("sha256", "abc"))),
            same(bytes), any(Storage.BlobTargetOption.class));
    }

    @Test
    void existingIdempotentObjectMustStillMatch() {
        byte[] bytes = {1, 2, 3};
        Blob blob = mock(Blob.class);
        when(storage.create(any(BlobInfo.class), same(bytes), any(Storage.BlobTargetOption.class)))
            .thenThrow(new StorageException(412, "already exists"));
        when(storage.get(any(com.google.cloud.storage.BlobId.class))).thenReturn(blob);
        when(blob.getSize()).thenReturn(3L);
        when(blob.getContentType()).thenReturn("image/png");
        when(blob.getMetadata()).thenReturn(Map.of("sha256", "abc"));

        images.put("verified/product/1/file.png", "image/png", bytes, "abc");
    }

    @Test
    void rejectsMismatchedStoredMetadata() {
        Blob blob = mock(Blob.class);
        when(storage.get(any(com.google.cloud.storage.BlobId.class))).thenReturn(blob);
        when(blob.getSize()).thenReturn(4L);
        when(blob.getContentType()).thenReturn("image/png");
        when(blob.getMetadata()).thenReturn(Map.of("sha256", "different"));

        assertThatThrownBy(() -> images.verify("key", "image/png", 3, "abc"))
            .isInstanceOf(ApiException.class);
    }
}
