package com.boothhana.api;

import com.boothhana.domain.DomainEnums.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class ApiModels {
    private ApiModels() {}

    public record UserView(Long id, String displayName, String profileImageUrl, List<Permission> permissions, boolean onboardingRequired) {
        public UserView(Long id,String displayName,String profileImageUrl,List<Permission> permissions){this(id,displayName,profileImageUrl,permissions,false);}
    }
    public record ProfileInput(@NotBlank String displayName, @Size(max = 512) String profileImageKey, boolean removeImage) {}
    public record EventView(Long id, String name, Instant startAt, Instant endAt, String venue, String description, String imageUrl, Instant reservationStartAt, Instant reservationEndAt, EventStatus status, long boothCount, ApplicationStatus applicationStatus, String imageKey) {}
    public record EventInput(@NotBlank @Size(max = 255) String name, @NotNull Instant startAt, @NotNull Instant endAt,
        @NotBlank @Size(max = 255) String venue, String description, String imageKey,
        Instant reservationStartAt, Instant reservationEndAt, EventStatus status, Boolean removeImage) {
        public EventInput(String name, Instant startAt, Instant endAt, String venue, String description, String imageKey,
                Instant reservationStartAt, Instant reservationEndAt, EventStatus status) {
            this(name, startAt, endAt, venue, description, imageKey, reservationStartAt, reservationEndAt, status, false);
        }
    }
    public record BoothView(Long id, Long eventId, String name, String creatorName, String boothNumber, String intro, String imageUrl, String imageKey, String snsUrl, ApplicationStatus status, boolean isPublic, long productCount, long reservableCount, List<NoticeView> notices) {}
    public record BoothInput(@NotBlank @Size(max = 255) String name, String intro, String imageKey, String snsUrl) {}
    public record EventBoothInput(@NotBlank @Size(max = 64) String boothNumber, String intro, boolean isPublic) {}
    public record ApplicationInput(@NotNull Long eventId, @NotNull Long boothId) {}
    public record ApplicationView(Long id, Long eventId, String eventName, Long boothId, String boothName, String creatorName, ApplicationStatus status, String reason, long revision) {
        public ApplicationView(Long id,Long eventId,String eventName,Long boothId,String boothName,String creatorName,ApplicationStatus status,String reason){this(id,eventId,eventName,boothId,boothName,creatorName,status,reason,0);}
    }
    public record ApplicationDecision(@PositiveOrZero long revision, @Size(max=512) String reason) {}
    public record RejectInput(@NotBlank @Size(max = 512) String reason) {}
    public record ProductInput(@NotBlank @Size(max = 255) String name, String description, @Size(max = 512) String imageKey,
            @PositiveOrZero @Max(1_000_000_000L) long price, @NotNull StockMode stockMode,
            @PositiveOrZero Integer stockQuantity, boolean soldOut, boolean isPublic, boolean reservationEnabled,
            @PositiveOrZero Long version, @PositiveOrZero Long productVersion) {
        // Source compatibility for existing create-only tests/callers. Updates require a revision.
        public ProductInput(String name, String description, String imageKey, long price, StockMode stockMode,
                Integer stockQuantity, boolean soldOut, boolean isPublic, boolean reservationEnabled) {
            this(name, description, imageKey, price, stockMode, stockQuantity, soldOut, isPublic, reservationEnabled, null, null);
        }
        public ProductInput(String name, String description, String imageKey, long price, StockMode stockMode,
                Integer stockQuantity, boolean soldOut, boolean isPublic, boolean reservationEnabled, Long version) {
            this(name, description, imageKey, price, stockMode, stockQuantity, soldOut, isPublic,
                reservationEnabled, version, null);
        }
    }
    public record ProductView(Long id, Long eventBoothId, String name, String description, String imageUrl, String imageKey, long price, StockMode stockMode, Integer stockQuantity, boolean soldOut, boolean isPublic, boolean reservationEnabled, long version, long productVersion) {}
    public record CopyProductsInput(List<Long> productIds) {}
    public record NoticeInput(@NotBlank @Size(max = 255) String title, @NotBlank String body, boolean pinned) {}
    public record NoticeView(Long id, Long eventBoothId, String title, String body, boolean pinned, Instant createdAt) {}
    public record LineInput(@NotNull @Positive Long eventProductId, @Min(1) @Max(1_000_000) int quantity) {}
    public record ReservationInput(@NotNull Long eventBoothId, @NotEmpty @Size(max = 100) List<@NotNull @Valid LineInput> items, @NotNull UUID requestId) {
        // Source-only convenience for existing internal create tests. HTTP uses the canonical record and requires requestId.
        public ReservationInput(Long boothId,List<LineInput> items) { this(boothId,items,UUID.randomUUID()); }
    }
    public record ReservationItemView(Long id, Long eventProductId, String productName, int quantity, long unitPrice) {}
    public record ReservationView(Long id, String reservationNo, Long eventBoothId, String eventName, String boothName, ReservationStatus status, String qrToken, Instant createdAt, List<ReservationItemView> items) {}
    public record PosInput(@NotNull Long eventBoothId, @NotNull PaymentMethod paymentMethod, @NotEmpty @Size(max = 100) List<@NotNull @Valid LineInput> items, @NotNull UUID requestId) {
        public PosInput(Long boothId,PaymentMethod method,List<LineInput> items) { this(boothId,method,items,UUID.randomUUID()); }
    }
    public record PosView(Long id, String saleNo, Long eventBoothId, PaymentMethod paymentMethod, PosStatus status, Instant soldAt, long totalAmount, List<ReservationItemView> items) {}
    public record UploadInput(@NotBlank @Size(max = 255) String fileName, @NotBlank String contentType,
            @NotBlank @Pattern(regexp = "booth|product|profile") String target,
            @NotNull @Min(1) @Max(10_485_760) Long fileSize) {
        public UploadInput(String fileName, String contentType, String target) { this(fileName, contentType, target, null); }
    }
    public record UploadCompleteInput(@NotBlank @Size(max = 512) String objectKey) {}
    public record UploadCompleteView(String objectKey) {}
    public record UploadTicketInput(@NotNull UUID uploadId,
        @NotBlank @Pattern(regexp = "booth|product|profile") String target,
        @NotBlank String contentType, @Min(1) @Max(10_485_760) long fileSize,
        @NotBlank @Pattern(regexp = "[0-9a-f]{64}") String sha256) {}
    public record UploadTicketView(java.util.UUID uploadId, String state) {}

    public record UploadView(String uploadUrl, String objectKey) {}
    public record ErrorView(int status, String code, String message, Map<String, String> fieldErrors, String requestId) {
        public ErrorView(int status, String code, String message, Map<String, String> fieldErrors) {
            this(status, code, message, fieldErrors, null);
        }
    }
}
