package com.boothhana.service;

import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.*;
import com.boothhana.domain.*;
import com.boothhana.domain.DomainEnums.*;
import com.boothhana.repository.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class PlatformService {
    private final UserAccountRepository users;
    private final EventRepository events;
    private final BoothRepository booths;
    private final EventBoothRepository eventBooths;
    private final ProductRepository products;
    private final EventProductRepository eventProducts;
    private final BoothNoticeRepository notices;
    private final ReservationRepository reservations;
    private final ReservationItemRepository reservationItems;
    private final PosSaleRepository posSales;
    private final PosSaleItemRepository posItems;
    private final String publicImageUrl;
    private final InventoryOperations inventory;
    private TradeRequestService tradeRequests;
    @org.springframework.beans.factory.annotation.Autowired
    public void configureTradeRequests(TradeRequestService requests) { this.tradeRequests=Objects.requireNonNull(requests); }
    public Map<String,Object> reservationReceipt(UserAccount user,UUID requestId) { return tradeRequests.receipt(user.id,"RESERVATION",requestId); }
    public Map<String,Object> posReceipt(UserAccount user,UUID requestId) { return tradeRequests.receipt(user.id,"POS",requestId); }
    private com.boothhana.upload.R2UploadService imageUploads;
    @org.springframework.beans.factory.annotation.Autowired
    public void configureImageUploads(com.boothhana.upload.R2UploadService imageUploads) {
        this.imageUploads = java.util.Objects.requireNonNull(imageUploads);
    }

    public PlatformService(UserAccountRepository users, EventRepository events, BoothRepository booths,
            EventBoothRepository eventBooths, ProductRepository products, EventProductRepository eventProducts,
            BoothNoticeRepository notices, ReservationRepository reservations, ReservationItemRepository reservationItems,
            PosSaleRepository posSales, PosSaleItemRepository posItems,
            @Value("${app.storage.public-url:}") String publicImageUrl) {
        this.users = users; this.events = events; this.booths = booths; this.eventBooths = eventBooths;
        this.products = products; this.eventProducts = eventProducts; this.notices = notices;
        this.reservations = reservations; this.reservationItems = reservationItems;
        this.posSales = posSales; this.posItems = posItems; this.publicImageUrl = publicImageUrl;
        this.inventory = new InventoryOperations(eventProducts);
    }

    /** Non-throwing reads for support state checks; authorization and infrastructure failures are NOT swallowed. */
    private <T> Optional<T> publicOptional(java.util.function.Supplier<T> read) {
        try { return Optional.of(read.get()); }
        catch (ApiException error) { if (error.status.value() != 404) throw error; return Optional.empty(); }
    }
    public Optional<EventView> findPublicEvent(Long id) { return publicOptional(() -> publicEvent(id)); }
    public Optional<BoothView> findPublicBooth(Long id) { return publicOptional(() -> publicBooth(id)); }
    public Optional<ProductView> findPublicProduct(Long id) { return publicOptional(() -> publicProduct(id)); }
    public Optional<ReservationView> findUserReservation(UserAccount owner, Long id) { return publicOptional(() -> userReservation(owner, id)); }

    public UserView user(UserAccount user, List<Permission> permissions) { return new UserView(user.id, user.displayName, image(user.profileImageKey), permissions, "PENDING".equals(user.onboardingStatus)); }

    @Transactional
    public UserView updateProfile(UserAccount user, List<Permission> permissions, ProfileInput input) {
        String name = input.displayName() == null ? "" : input.displayName().strip();
        if (name.codePointCount(0, name.length()) < 2 || name.codePointCount(0, name.length()) > 20
                || name.codePoints().anyMatch(Character::isISOControl))
            throw ApiException.badRequest("닉네임은 2~20자로 입력해 주세요.");
        if (input.removeImage() && input.profileImageKey() != null)
            throw ApiException.badRequest("이미지 변경과 삭제를 동시에 요청할 수 없습니다.");
        if (input.profileImageKey() != null) {
            if (input.profileImageKey().isBlank()) throw ApiException.badRequest("올바른 프로필 이미지가 아닙니다.");
            validateImageKey(user.id, "profile", input.profileImageKey(), user.profileImageKey);
            user.profileImageKey = input.profileImageKey();
        } else if (input.removeImage()) user.profileImageKey = null;
        user.displayName = name;
        user.customDisplayName = true;
        return user(users.save(user), permissions);
    }

    public List<EventView> publicEvents() {
        List<Event> result = new ArrayList<>(events.findByStatusOrderByStartAtAsc(EventStatus.PUBLISHED));
        result.addAll(events.findByStatusOrderByStartAtAsc(EventStatus.ENDED));
        return eventViews(result, Map.of(), true);
    }
    public EventView publicEvent(Long id) {
        Event event = requireEvent(id);
        if (event.status == EventStatus.DRAFT) throw ApiException.notFound("공개된 행사를 찾을 수 없습니다.");
        return eventView(event, null, eventBooths.countByEventIdAndStatusAndIsPublicTrue(id, ApplicationStatus.APPROVED));
    }
    public List<BoothView> publicEventBooths(Long eventId) {
        publicEvent(eventId);
        return eventBooths.findByEventIdAndStatusAndIsPublicTrue(eventId, ApplicationStatus.APPROVED).stream().map(this::boothView).toList();
    }
    public BoothView publicBooth(Long id) { return boothView(requirePublicEventBooth(id)); }
    public List<ProductView> publicProducts(Long eventBoothId) {
        requirePublicEventBooth(eventBoothId);
        return eventProducts.findByEventBoothIdAndIsPublicTrueOrderByIdDesc(eventBoothId).stream().map(this::productView).toList();
    }
    public ProductView publicProduct(Long id) {
        EventProduct value = eventProducts.findById(id).orElseThrow(() -> ApiException.notFound("상품을 찾을 수 없습니다."));
        if (!value.isPublic) throw ApiException.notFound("상품을 찾을 수 없습니다.");
        requirePublicEventBooth(value.eventBoothId);
        return productView(value);
    }

    public List<EventView> creatorEvents(UserAccount owner) { return creatorEvents(owner, null); }
    public List<EventView> creatorEvents(UserAccount owner, Long boothId) {
        List<Long> boothIds = boothId == null
            ? booths.findByOwnerUserIdOrderByIdDesc(owner.id).stream().map(value -> value.id).toList()
            : List.of(requireOwnedBooth(owner, boothId).id);
        Map<Long, ApplicationStatus> applications = boothIds.isEmpty() ? Map.of() : eventBooths.findByBoothIdIn(boothIds).stream()
            .collect(java.util.stream.Collectors.toMap(value -> value.eventId, value -> value.status, (left, right) -> left));
        return eventViews(events.findAllByOrderByStartAtDesc().stream().filter(e -> e.status != EventStatus.DRAFT).toList(), applications, false);
    }
    public List<BoothView> creatorBooths(UserAccount owner) { return booths.findByOwnerUserIdOrderByIdDesc(owner.id).stream().map(this::basicBoothView).toList(); }
    public List<BoothView> creatorEventBooths(UserAccount owner) {
        List<Long> ids = booths.findByOwnerUserIdOrderByIdDesc(owner.id).stream().map(value -> value.id).toList();
        if (ids.isEmpty()) return List.of();
        return eventBooths.findByBoothIdIn(ids).stream().filter(value -> value.status == ApplicationStatus.APPROVED).map(this::boothView).toList();
    }
    @Transactional
    public BoothView updateEventBooth(UserAccount owner, Long id, EventBoothInput input) {
        EventBooth value = requireMutableOwnedEventBooth(owner, id);
        value.boothNumber = input.boothNumber().trim();
        value.intro = text(input.intro());
        value.isPublic = input.isPublic();
        return boothView(eventBooths.save(value));
    }
    @Transactional
    public void deleteEventBooth(UserAccount owner, Long id) {
        EventBooth value = requireMutableOwnedEventBooth(owner, id);
        if (reservations.countByEventBoothId(id) > 0 || posSales.countByEventBoothId(id) > 0) {
            throw ApiException.conflict("예약 또는 판매가 연결된 행사 부스는 삭제할 수 없습니다.");
        }
        eventProducts.deleteAll(eventProducts.findByEventBoothIdOrderByIdDesc(id));
        notices.deleteAll(notices.findByEventBoothIdOrderByPinnedDescCreatedAtDesc(id));
        eventBooths.delete(value);
    }
    @Transactional
    public BoothView createBooth(UserAccount owner, BoothInput input) {
        validateImageKey(owner.id, "booth", input.imageKey(), null); Booth booth = new Booth(); booth.ownerUserId = owner.id; apply(booth, input); return basicBoothView(booths.save(booth));
    }
    @Transactional
    public BoothView updateBooth(UserAccount owner, Long id, BoothInput input) {
        Booth booth = requireOwnedBooth(owner, id); validateImageKey(owner.id, "booth", input.imageKey(), booth.imageKey); apply(booth, input); return basicBoothView(booths.save(booth));
    }
    @Transactional
    public void deleteBooth(UserAccount owner, Long id) {
        Booth booth = requireOwnedBooth(owner, id);
        List<EventBooth> linked = eventBooths.findByBoothIdIn(List.of(id));
        boolean used = linked.stream().anyMatch(value -> reservations.countByEventBoothId(value.id) > 0 || posSales.countByEventBoothId(value.id) > 0);
        if (used) throw ApiException.conflict("예약 또는 판매가 연결된 부스는 삭제할 수 없습니다.");
        linked.forEach(value -> { eventProducts.deleteAll(eventProducts.findByEventBoothIdOrderByIdDesc(value.id)); notices.deleteAll(notices.findByEventBoothIdOrderByPinnedDescCreatedAtDesc(value.id)); });
        eventBooths.deleteAll(linked); products.deleteAll(products.findByBoothIdOrderByIdDesc(id)); booths.delete(booth);
    }
    @Transactional
    public ApplicationView applyToEvent(UserAccount owner, ApplicationInput input) {
        Event event = requireEvent(input.eventId());
        if (event.status != EventStatus.PUBLISHED) throw ApiException.conflict("현재 참가 신청을 받는 행사가 아닙니다.");
        Booth booth = requireOwnedBooth(owner, input.boothId());
        if (eventBooths.findByEventIdAndBoothId(event.id, booth.id).isPresent()) throw ApiException.conflict("이미 참가 신청한 행사입니다.");
        EventBooth value = new EventBooth(); value.eventId = event.id; value.boothId = booth.id; value.intro = booth.description;
        return applicationView(eventBooths.save(value));
    }

    public List<ProductView> creatorProducts(UserAccount owner, Long eventBoothId) {
        requireApprovedOwnedEventBooth(owner, eventBoothId);
        return eventProducts.findByEventBoothIdOrderByIdDesc(eventBoothId).stream().map(this::productView).toList();
    }
    @Transactional
    public ProductView createProduct(UserAccount owner, Long eventBoothId, ProductInput input) {
        EventBooth eventBooth = requireMutableOwnedEventBooth(owner, eventBoothId);
        validateImageKey(owner.id, "product", input.imageKey(), null);
        Product product = new Product(); product.boothId = eventBooth.boothId; product.name = input.name(); product.description = text(input.description()); product.imageKey = input.imageKey();
        product = products.save(product);
        EventProduct value = new EventProduct(); value.eventBoothId = eventBooth.id; value.productId = product.id; apply(value, input);
        return productView(eventProducts.save(value));
    }
    @Transactional
    public ProductView updateProduct(UserAccount owner, Long id, ProductInput input) {
        EventProduct value = requireLockedOwnedEventProduct(owner, id); requireMutableOwnedEventBooth(owner, value.eventBoothId);
        if (input.version() == null || input.version() != value.version)
            throw ApiException.conflict("상품 또는 재고가 변경되었습니다. 새로고침 후 다시 저장해 주세요.");
        Product product = products.findByIdForUpdate(value.productId).orElseThrow();
        if (!ProductRevisions.current(input.version(), value.version, input.productVersion(), product.version))
            throw ApiException.conflict("상품 기본정보 또는 재고가 변경되었습니다. 새로고침 후 다시 저장해 주세요.");
        validateImageKey(owner.id, "product", input.imageKey(), product.imageKey);
        product.name = input.name(); product.description = text(input.description()); product.imageKey = input.imageKey(); products.saveAndFlush(product);
        apply(value, input); return productView(eventProducts.saveAndFlush(value));
    }
    @Transactional
    public void deleteProduct(UserAccount owner, Long id) {
        EventProduct value = requireLockedOwnedEventProduct(owner, id); requireMutableOwnedEventBooth(owner, value.eventBoothId);
        if (reservationItems.countByEventProductId(id) > 0 || posItems.countByEventProductId(id) > 0) throw ApiException.conflict("예약 또는 판매가 연결된 상품은 삭제할 수 없습니다.");
        Long productId = value.productId; eventProducts.delete(value);
        if (eventProducts.countByProductId(productId) == 0) products.deleteById(productId);
    }
    @Transactional
    public List<ProductView> copyProducts(UserAccount owner, Long eventBoothId, CopyProductsInput input) {
        EventBooth target = requireMutableOwnedEventBooth(owner, eventBoothId);
        Set<Long> requested = input.productIds() == null ? Set.of() : new HashSet<>(input.productIds());
        Set<Long> existing = eventProducts.findByEventBoothIdOrderByIdDesc(eventBoothId).stream().map(value -> value.productId).collect(java.util.stream.Collectors.toSet());
        List<Product> candidates = products.findByBoothIdOrderByIdDesc(target.boothId).stream().filter(value -> !existing.contains(value.id)).filter(value -> requested.isEmpty() || requested.contains(value.id)).toList();
        for (Product product : candidates) { EventProduct value = new EventProduct(); value.eventBoothId = target.id; value.productId = product.id; value.price = 0; value.stockMode = StockMode.FINITE; value.stockQuantity = 0; value.isPublic = false; value.reservationEnabled = false; eventProducts.save(value); }
        return creatorProducts(owner, eventBoothId);
    }

    public List<NoticeView> creatorNotices(UserAccount owner, Long eventBoothId) { requireApprovedOwnedEventBooth(owner, eventBoothId); return notices.findByEventBoothIdOrderByPinnedDescCreatedAtDesc(eventBoothId).stream().map(this::noticeView).toList(); }
    @Transactional
    public NoticeView createNotice(UserAccount owner, Long eventBoothId, NoticeInput input) {
        requireMutableOwnedEventBooth(owner, eventBoothId); if (input.pinned()) unpinAll(eventBoothId, null);
        BoothNotice value = new BoothNotice(); value.eventBoothId = eventBoothId; apply(value, input); return noticeView(notices.save(value));
    }
    @Transactional
    public NoticeView updateNotice(UserAccount owner, Long id, NoticeInput input) {
        BoothNotice value = requireNotice(id); requireMutableOwnedEventBooth(owner, value.eventBoothId); if (input.pinned()) unpinAll(value.eventBoothId, id); apply(value, input); return noticeView(notices.save(value));
    }
    @Transactional
    public NoticeView pinNotice(UserAccount owner, Long id) { BoothNotice value = requireNotice(id); requireMutableOwnedEventBooth(owner, value.eventBoothId); unpinAll(value.eventBoothId, id); value.pinned = true; return noticeView(notices.save(value)); }
    @Transactional
    public void deleteNotice(UserAccount owner, Long id) { BoothNotice value = requireNotice(id); requireMutableOwnedEventBooth(owner, value.eventBoothId); notices.delete(value); }

    @Transactional
    public ReservationView createReservation(UserAccount user, ReservationInput input) {
        String requestHash=TradeRequestRules.fingerprint(input.eventBoothId(),null,input.items());
        var prior=tradeRequests.begin(user.id,"RESERVATION",input.requestId(),requestHash);
        if(prior.isPresent()) return userReservation(user,prior.get());
        EventBooth eventBooth = requirePublicEventBooth(input.eventBoothId()); Event event = requireEvent(eventBooth.eventId);
        if (event.status != EventStatus.PUBLISHED) throw ApiException.conflict("종료된 행사에는 새 예약을 만들 수 없습니다.");
        Instant now = Instant.now();
        if (event.reservationStartAt != null && now.isBefore(event.reservationStartAt)) throw ApiException.conflict("아직 예약 가능 기간이 아닙니다.");
        if (event.reservationEndAt != null && !now.isBefore(event.reservationEndAt)) throw ApiException.conflict("예약 가능 기간이 종료되었습니다.");
        List<EventProduct> selected = inventory.lockLines(input.items());
        for (int index = 0; index < selected.size(); index++) { EventProduct item = selected.get(index); LineInput line = input.items().get(index); if (!Objects.equals(item.eventBoothId, eventBooth.id) || !item.isPublic || !item.reservationEnabled || item.soldOut) throw ApiException.conflict("예약할 수 없는 상품이 포함되어 있습니다."); decrement(item, line.quantity()); }
        Reservation reservation = new Reservation(); reservation.userId = user.id; reservation.eventBoothId = eventBooth.id; reservation.reservationNo = number("RSV"); reservation.qrToken = reservation.reservationNo; reservation = reservations.save(reservation);
        for (int index = 0; index < selected.size(); index++) { EventProduct product = selected.get(index); ReservationItem line = new ReservationItem(); line.reservationId = reservation.id; line.eventProductId = product.id; line.quantity = input.items().get(index).quantity(); line.unitPrice = product.price; reservationItems.save(line); }
        tradeRequests.complete(user.id,"RESERVATION",input.requestId(),requestHash,reservation.id);
        return reservationView(reservation);
    }
    public List<ReservationView> userReservations(UserAccount user) { return reservations.findByUserIdOrderByCreatedAtDesc(user.id).stream().map(this::reservationView).toList(); }
    public ReservationView userReservation(UserAccount user, Long id) { Reservation value = requireReservation(id); if (!Objects.equals(value.userId, user.id)) throw ApiException.forbidden("다른 사용자의 예약은 볼 수 없습니다."); return reservationView(value); }
    @Transactional
    public ReservationView cancelReservation(UserAccount user, Long id) {
        Reservation value = reservations.findByIdForUpdate(id).orElseThrow(() -> ApiException.notFound("예약을 찾을 수 없습니다."));
        if (!Objects.equals(value.userId, user.id)) throw ApiException.forbidden("다른 사용자의 예약을 취소할 수 없습니다.");
        if (value.status == ReservationStatus.CANCELED) return reservationView(value);
        if (value.status == ReservationStatus.PICKED_UP) throw ApiException.conflict("수령 완료된 예약은 취소할 수 없습니다.");
        List<ReservationItem> lines = reservationItems.findByReservationId(id);
        Map<Long, EventProduct> locked = inventory.lockAll(lines.stream().map(line -> line.eventProductId).toList());
        for (ReservationItem line : lines) increment(locked.get(line.eventProductId), line.quantity);
        value.status = ReservationStatus.CANCELED; value.canceledAt = Instant.now(); return reservationView(reservations.save(value));
    }

    public List<ReservationView> creatorReservations(UserAccount owner) { List<Long> ids = ownedEventBoothIds(owner); if (ids.isEmpty()) return List.of(); return reservations.findByEventBoothIdInOrderByCreatedAtDesc(ids).stream().map(this::reservationView).toList(); }
    public ReservationView creatorReservationByNumber(UserAccount owner, String number) { Reservation value = reservations.findByReservationNo(number).orElseThrow(() -> ApiException.notFound("예약번호를 찾을 수 없습니다.")); if (!ownedEventBoothIds(owner).contains(value.eventBoothId)) throw ApiException.forbidden("다른 부스의 예약입니다."); return reservationView(value); }
    @Transactional
    public ReservationView pickup(UserAccount owner, Long id) { Reservation value = reservations.findByIdForUpdate(id).orElseThrow(() -> ApiException.notFound("예약을 찾을 수 없습니다.")); if (!ownedEventBoothIds(owner).contains(value.eventBoothId)) throw ApiException.forbidden("다른 부스의 예약입니다."); if (value.status == ReservationStatus.RESERVED) { value.status = ReservationStatus.PICKED_UP; value.pickedUpAt = Instant.now(); value = reservations.save(value); } return reservationView(value); }

    public List<PosView> posSales(UserAccount owner) { List<Long> ids = ownedEventBoothIds(owner); if (ids.isEmpty()) return List.of(); return posSales.findByEventBoothIdInOrderBySoldAtDesc(ids).stream().map(this::posView).toList(); }
    public PosView posSale(UserAccount owner, Long id) {
        PosSale sale = posSales.findById(id).orElseThrow(() -> ApiException.notFound("판매 기록을 찾을 수 없습니다."));
        if (!ownedEventBoothIds(owner).contains(sale.eventBoothId)) throw ApiException.forbidden("다른 부스의 판매 기록입니다.");
        return posView(sale);
    }
    @Transactional
    public PosView createPos(UserAccount owner, PosInput input) {
        if(input.paymentMethod()==null) throw ApiException.badRequest("결제수단을 확인해 주세요.");
        String requestHash=TradeRequestRules.fingerprint(input.eventBoothId(),input.paymentMethod().name(),input.items());
        var prior=tradeRequests.begin(owner.id,"POS",input.requestId(),requestHash);
        if(prior.isPresent()) return posSale(owner,prior.get());
        requireMutableOwnedEventBooth(owner, input.eventBoothId());
        List<EventProduct> selected = inventory.lockLines(input.items());
        for (int i = 0; i < selected.size(); i++) { EventProduct product = selected.get(i); if (!Objects.equals(product.eventBoothId, input.eventBoothId()) || product.soldOut) throw ApiException.conflict("판매할 수 없는 상품이 포함되어 있습니다."); decrement(product, input.items().get(i).quantity()); }
        PosSale sale = new PosSale(); sale.eventBoothId = input.eventBoothId(); sale.paymentMethod = input.paymentMethod(); sale.saleNo = number("POS"); sale = posSales.save(sale);
        for (int i = 0; i < selected.size(); i++) { EventProduct product = selected.get(i); PosSaleItem line = new PosSaleItem(); line.posSaleId = sale.id; line.eventProductId = product.id; line.quantity = input.items().get(i).quantity(); line.unitPrice = product.price; posItems.save(line); }
        tradeRequests.complete(owner.id,"POS",input.requestId(),requestHash,sale.id);
        return posView(sale);
    }
    @Transactional
    public PosView cancelPos(UserAccount owner, Long id) {
        PosSale sale = posSales.findByIdForUpdate(id).orElseThrow(() -> ApiException.notFound("판매 기록을 찾을 수 없습니다."));
        if (!ownedEventBoothIds(owner).contains(sale.eventBoothId)) throw ApiException.forbidden("다른 부스의 판매 기록입니다.");
        if (sale.status == PosStatus.CANCELED) return posView(sale);
        // Approved decision D-009: POS cancellation never automatically restores stock.
        sale.status = PosStatus.CANCELED;
        return posView(posSales.save(sale));
    }

    public List<EventView> adminEvents() { return eventViews(events.findAllByOrderByStartAtDesc(), Map.of(), false); }
    public EventView adminEvent(Long id) { return eventView(requireEvent(id)); }
    @Transactional public EventView createEvent(EventInput input) { Event value = new Event(); apply(value, input); return eventView(events.save(value)); }
    @Transactional public EventView updateEvent(Long id, EventInput input) { Event value = requireEvent(id); apply(value, input); return eventView(events.save(value)); }
    @Transactional public EventView publishEvent(Long id) { Event value = requireEvent(id); value.status = EventStatus.PUBLISHED; return eventView(events.save(value)); }
    @Transactional public EventView endEvent(Long id) { Event value = requireEvent(id); value.status = EventStatus.ENDED; return eventView(events.save(value)); }
    @Transactional public void deleteEvent(Long id) { Event value = requireEvent(id); if (eventBooths.existsByEventId(id)) throw ApiException.conflict("참가 부스가 연결된 행사는 삭제할 수 없습니다."); events.delete(value); }
    public List<ApplicationView> applications() { return eventBooths.findAllByOrderByIdDesc().stream().map(this::applicationView).toList(); }
    @Transactional public ApplicationView approve(Long id) { EventBooth value = eventBooths.findLocked(id).orElseThrow(() -> ApiException.notFound("신청 없음")); if(value.status != ApplicationStatus.PENDING) throw ApiException.conflict("대기 중인 신청만 승인할 수 있습니다."); value.rejectionReason = null; value.status = ApplicationStatus.APPROVED; value.isPublic = true; if (value.boothNumber == null) value.boothNumber = "미정"; return applicationView(eventBooths.save(value)); }
    @Transactional public ApplicationView reject(Long id, RejectInput input) { EventBooth value = eventBooths.findLocked(id).orElseThrow(() -> ApiException.notFound("신청 없음")); if(value.status != ApplicationStatus.PENDING) throw ApiException.conflict("대기 중인 신청만 반려할 수 있습니다."); value.status = ApplicationStatus.REJECTED; value.isPublic = false; value.rejectionReason = input.reason(); return applicationView(eventBooths.save(value)); }

    private Event requireEvent(Long id) { return events.findById(id).orElseThrow(() -> ApiException.notFound("행사를 찾을 수 없습니다.")); }
    private Booth requireOwnedBooth(UserAccount owner, Long id) { Booth value = booths.findById(id).orElseThrow(() -> ApiException.notFound("부스를 찾을 수 없습니다.")); if (!Objects.equals(value.ownerUserId, owner.id)) throw ApiException.forbidden("다른 크리에이터의 부스입니다."); return value; }
    private EventBooth requireEventBooth(Long id) { return eventBooths.findById(id).orElseThrow(() -> ApiException.notFound("행사 부스를 찾을 수 없습니다.")); }
    private EventBooth requirePublicEventBooth(Long id) { EventBooth value = requireEventBooth(id); Event event = requireEvent(value.eventId); if (value.status != ApplicationStatus.APPROVED || !value.isPublic || event.status == EventStatus.DRAFT) throw ApiException.notFound("공개된 부스를 찾을 수 없습니다."); return value; }
    private EventBooth requireOwnedEventBooth(UserAccount owner, Long id) { EventBooth value = requireEventBooth(id); requireOwnedBooth(owner, value.boothId); return value; }
    private EventBooth requireApprovedOwnedEventBooth(UserAccount owner, Long id) { EventBooth value = requireOwnedEventBooth(owner, id); if (value.status != ApplicationStatus.APPROVED) throw ApiException.conflict("승인된 행사 부스만 관리할 수 있습니다."); return value; }
    private EventBooth requireMutableOwnedEventBooth(UserAccount owner, Long id) { EventBooth value = requireApprovedOwnedEventBooth(owner, id); if (requireEvent(value.eventId).status == EventStatus.ENDED) throw ApiException.conflict("종료된 행사는 수정하거나 새 판매를 기록할 수 없습니다."); return value; }
    private EventProduct requireOwnedEventProduct(UserAccount owner, Long id) { EventProduct value = eventProducts.findById(id).orElseThrow(() -> ApiException.notFound("상품을 찾을 수 없습니다.")); requireOwnedEventBooth(owner, value.eventBoothId); return value; }
    private BoothNotice requireNotice(Long id) { return notices.findById(id).orElseThrow(() -> ApiException.notFound("공지를 찾을 수 없습니다.")); }
    private Reservation requireReservation(Long id) { return reservations.findById(id).orElseThrow(() -> ApiException.notFound("예약을 찾을 수 없습니다.")); }
    private List<Long> ownedEventBoothIds(UserAccount owner) { List<Long> boothIds = booths.findByOwnerUserIdOrderByIdDesc(owner.id).stream().map(value -> value.id).toList(); return boothIds.isEmpty() ? List.of() : eventBooths.findByBoothIdIn(boothIds).stream().map(value -> value.id).toList(); }
    private EventProduct requireLockedOwnedEventProduct(UserAccount owner, Long id) {
        EventProduct value = eventProducts.findByIdForUpdate(id).orElseThrow(() -> ApiException.notFound("상품을 찾을 수 없습니다."));
        requireOwnedEventBooth(owner, value.eventBoothId);
        return value;
    }
    private void decrement(EventProduct item, int quantity) { inventory.decrement(item, quantity); }
    private void increment(EventProduct item, int quantity) { inventory.increment(item, quantity); }
    private String itemName(EventProduct item) { return products.findById(item.productId).map(value -> value.name).orElse("상품"); }
    private void unpinAll(Long eventBoothId, Long except) { for (BoothNotice notice : notices.findByEventBoothIdOrderByPinnedDescCreatedAtDesc(eventBoothId)) if (notice.pinned && !Objects.equals(notice.id, except)) { notice.pinned = false; notices.save(notice); } }
    private void apply(Booth value, BoothInput input) { value.name = input.name(); value.description = text(input.intro()); value.imageKey = input.imageKey(); value.snsUrl = input.snsUrl(); }
    private void apply(EventProduct value, ProductInput input) { if (input.stockMode() == StockMode.FINITE && input.stockQuantity() == null) throw ApiException.badRequest("유한 재고 상품은 재고 수량이 필요합니다."); value.price = input.price(); value.stockMode = input.stockMode(); value.stockQuantity = input.stockMode() == StockMode.INFINITE ? null : input.stockQuantity(); value.soldOut = input.soldOut(); value.isPublic = input.isPublic(); value.reservationEnabled = input.reservationEnabled(); }
    private void apply(BoothNotice value, NoticeInput input) { value.title = input.title(); value.body = input.body(); value.pinned = input.pinned(); }
    private void apply(Event value, EventInput input) { if (!input.startAt().isBefore(input.endAt())) throw ApiException.badRequest("행사 시작은 종료보다 빨라야 합니다."); if (input.reservationStartAt() != null && input.reservationEndAt() != null && !input.reservationStartAt().isBefore(input.reservationEndAt())) throw ApiException.badRequest("예약 시작은 예약 종료보다 빨라야 합니다."); value.name = input.name(); value.startAt = input.startAt(); value.endAt = input.endAt(); value.venue = input.venue(); value.description = text(input.description()); value.imageKey = EventImageUpdate.resolve(value.imageKey, input.imageKey(), input.removeImage()); value.reservationStartAt = input.reservationStartAt(); value.reservationEndAt = input.reservationEndAt(); value.status = input.status() == null ? EventStatus.DRAFT : input.status(); }
    private EventView eventView(Event value) { return eventView(value, null); }
    private EventView eventView(Event value, ApplicationStatus applicationStatus) {
        return eventView(value, applicationStatus, eventBooths.countByEventIdAndStatus(value.id, ApplicationStatus.APPROVED));
    }
    private EventView eventView(Event value, ApplicationStatus applicationStatus, long count) {
        return new EventView(value.id, value.name, value.startAt, value.endAt, value.venue, value.description,
            image(value.imageKey), value.reservationStartAt, value.reservationEndAt, value.status, count, applicationStatus, value.imageKey);
    }
    private List<EventView> eventViews(List<Event> values, Map<Long, ApplicationStatus> applications, boolean publicOnly) {
        if (values.isEmpty()) return List.of();
        Map<Long, Long> counts = new HashMap<>();
        for (EventBoothRepository.EventBoothCount count : eventBooths.countForEvents(
                values.stream().map(value -> value.id).toList(), ApplicationStatus.APPROVED, publicOnly))
            counts.put(count.getEventId(), count.getTotal());
        return values.stream().map(value -> eventView(value, applications.get(value.id), counts.getOrDefault(value.id, 0L))).toList();
    }
    private BoothView basicBoothView(Booth value) { return new BoothView(value.id, null, value.name, users.findById(value.ownerUserId).map(user -> user.displayName).orElse("크리에이터"), "", value.description, image(value.imageKey), value.imageKey, value.snsUrl, ApplicationStatus.APPROVED, false, products.findByBoothIdOrderByIdDesc(value.id).size(), 0, List.of()); }
    private BoothView boothView(EventBooth value) { Booth booth = booths.findById(value.boothId).orElseThrow(); List<EventProduct> lines = eventProducts.findByEventBoothIdOrderByIdDesc(value.id); long reservable = lines.stream().filter(item -> item.isPublic && item.reservationEnabled && !item.soldOut && (item.stockMode == StockMode.INFINITE || (item.stockQuantity != null && item.stockQuantity > 0))).count(); return new BoothView(value.id, value.eventId, booth.name, users.findById(booth.ownerUserId).map(user -> user.displayName).orElse("크리에이터"), text(value.boothNumber), value.intro, image(booth.imageKey), booth.imageKey, booth.snsUrl, value.status, value.isPublic, lines.size(), reservable, notices.findByEventBoothIdOrderByPinnedDescCreatedAtDesc(value.id).stream().map(this::noticeView).toList()); }
    private ProductView productView(EventProduct value) { Product product = products.findById(value.productId).orElseThrow(); return new ProductView(value.id, value.eventBoothId, product.name, product.description, image(product.imageKey), product.imageKey, value.price, value.stockMode, value.stockQuantity, value.soldOut, value.isPublic, value.reservationEnabled, value.version, product.version); }
    private NoticeView noticeView(BoothNotice value) { return new NoticeView(value.id, value.eventBoothId, value.title, value.body, value.pinned, value.createdAt); }
    private ApplicationView applicationView(EventBooth value) { Event event = requireEvent(value.eventId); Booth booth = booths.findById(value.boothId).orElseThrow(); UserAccount owner = users.findById(booth.ownerUserId).orElseThrow(); return new ApplicationView(value.id, event.id, event.name, booth.id, booth.name, owner.displayName, value.status, value.rejectionReason, value.version); }
    private ReservationView reservationView(Reservation value) { EventBooth eb = requireEventBooth(value.eventBoothId); Event event = requireEvent(eb.eventId); Booth booth = booths.findById(eb.boothId).orElseThrow(); List<ReservationItemView> items = reservationItems.findByReservationId(value.id).stream().map(line -> new ReservationItemView(line.id, line.eventProductId, itemName(eventProducts.findById(line.eventProductId).orElseThrow()), line.quantity, line.unitPrice)).toList(); return new ReservationView(value.id, value.reservationNo, value.eventBoothId, event.name, booth.name, value.status, value.qrToken, value.createdAt, items); }
    private PosView posView(PosSale value) { List<ReservationItemView> items = posItems.findByPosSaleId(value.id).stream().map(line -> new ReservationItemView(line.id, line.eventProductId, itemName(eventProducts.findById(line.eventProductId).orElseThrow()), line.quantity, line.unitPrice)).toList(); long total = items.stream().mapToLong(line -> line.unitPrice() * line.quantity()).sum(); return new PosView(value.id, value.saleNo, value.eventBoothId, value.paymentMethod, value.status, value.soldAt, total, items); }
    private String image(String key) { if (key == null || key.isBlank()) return null; if (key.startsWith("http")) return key; return publicImageUrl.isBlank() ? null : publicImageUrl.replaceAll("/$", "") + "/" + key; }
    private void validateImageKey(Long owner, String target, String key, String previous) {
        // Preserve unmodified legacy keys; all NEW non-empty references need a verified receipt.
        if (Objects.equals(key, previous) || key == null || key.isBlank()) return;
        if (imageUploads == null) throw ApiException.conflict("이미지 검증 서비스를 사용할 수 없습니다.");
        imageUploads.requireVerified(owner, target, key);
    }
    private String text(String value) { return value == null ? "" : value; }
    private String number(String prefix) { return RecordNumbers.create(prefix); }
}
