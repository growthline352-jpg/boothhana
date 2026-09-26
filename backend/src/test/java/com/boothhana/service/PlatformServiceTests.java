package com.boothhana.service;

import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.EventInput;
import com.boothhana.api.ApiModels.EventBoothInput;
import com.boothhana.api.ApiModels.LineInput;
import com.boothhana.api.ApiModels.NoticeInput;
import com.boothhana.api.ApiModels.PosInput;
import com.boothhana.api.ApiModels.ProductInput;
import com.boothhana.api.ApiModels.ReservationInput;
import com.boothhana.domain.Booth;
import com.boothhana.domain.Event;
import com.boothhana.domain.EventBooth;
import com.boothhana.domain.EventProduct;
import com.boothhana.domain.PosSale;
import com.boothhana.domain.PosSaleItem;
import com.boothhana.domain.Product;
import com.boothhana.domain.Reservation;
import com.boothhana.domain.UserAccount;
import com.boothhana.domain.DomainEnums.ApplicationStatus;
import com.boothhana.domain.DomainEnums.EventStatus;
import com.boothhana.domain.DomainEnums.PaymentMethod;
import com.boothhana.domain.DomainEnums.StockMode;
import com.boothhana.repository.BoothNoticeRepository;
import com.boothhana.repository.BoothRepository;
import com.boothhana.repository.EventBoothRepository;
import com.boothhana.repository.EventProductRepository;
import com.boothhana.repository.EventRepository;
import com.boothhana.repository.PosSaleItemRepository;
import com.boothhana.repository.PosSaleRepository;
import com.boothhana.repository.ProductRepository;
import com.boothhana.repository.ReservationItemRepository;
import com.boothhana.repository.ReservationRepository;
import com.boothhana.repository.UserAccountRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PlatformServiceTests {
    private final UserAccountRepository users = mock(UserAccountRepository.class);
    private final EventRepository events = mock(EventRepository.class);
    private final BoothRepository booths = mock(BoothRepository.class);
    private final EventBoothRepository eventBooths = mock(EventBoothRepository.class);
    private final ProductRepository products = mock(ProductRepository.class);
    private final EventProductRepository eventProducts = mock(EventProductRepository.class);
    private final BoothNoticeRepository notices = mock(BoothNoticeRepository.class);
    private final ReservationRepository reservations = mock(ReservationRepository.class);
    private final ReservationItemRepository reservationItems = mock(ReservationItemRepository.class);
    private final PosSaleRepository posSales = mock(PosSaleRepository.class);
    private final PosSaleItemRepository posItems = mock(PosSaleItemRepository.class);
    private PlatformService service;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.lenient().when(eventProducts.findByIdForUpdate(org.mockito.ArgumentMatchers.anyLong()))
            .thenAnswer(invocation -> eventProducts.findById(invocation.getArgument(0)));
        service = new PlatformService(users, events, booths, eventBooths, products, eventProducts,
            notices, reservations, reservationItems, posSales, posItems, "");
        service.configureTradeRequests(org.mockito.Mockito.mock(TradeRequestService.class));
    }

    @Test
    void rejectsReservationBeforeConfiguredWindow() {
        Event event = publishedEvent();
        event.reservationStartAt = Instant.now().plusSeconds(3600);
        EventBooth eventBooth = approvedEventBooth();
        when(eventBooths.findById(eventBooth.id)).thenReturn(Optional.of(eventBooth));
        when(events.findById(event.id)).thenReturn(Optional.of(event));

        assertThatThrownBy(() -> service.createReservation(user(), new ReservationInput(eventBooth.id, List.of(new LineInput(1L, 1)))))
            .isInstanceOf(ApiException.class)
            .hasMessage("아직 예약 가능 기간이 아닙니다.");
    }

    @Test
    void rejectsReservationAfterConfiguredWindow() {
        Event event = publishedEvent();
        event.reservationEndAt = Instant.now().minusSeconds(1);
        EventBooth eventBooth = approvedEventBooth();
        when(eventBooths.findById(eventBooth.id)).thenReturn(Optional.of(eventBooth));
        when(events.findById(event.id)).thenReturn(Optional.of(event));

        assertThatThrownBy(() -> service.createReservation(user(), new ReservationInput(eventBooth.id, List.of(new LineInput(1L, 1)))))
            .isInstanceOf(ApiException.class)
            .hasMessage("예약 가능 기간이 종료되었습니다.");
    }

    @Test
    void createsReservationInsideConfiguredWindow() {
        Event event = publishedEvent();
        event.reservationStartAt = Instant.now().minusSeconds(3600);
        event.reservationEndAt = Instant.now().plusSeconds(3600);
        EventBooth eventBooth = approvedEventBooth();
        EventProduct product = reservableProduct(eventBooth.id);
        Booth booth = new Booth();
        booth.id = eventBooth.boothId;
        booth.name = "예약 부스";
        when(eventBooths.findById(eventBooth.id)).thenReturn(Optional.of(eventBooth));
        when(events.findById(event.id)).thenReturn(Optional.of(event));
        when(booths.findById(booth.id)).thenReturn(Optional.of(booth));
        when(eventProducts.findById(product.id)).thenReturn(Optional.of(product));
        when(reservations.save(any(Reservation.class))).thenAnswer(invocation -> {
            Reservation reservation = invocation.getArgument(0);
            reservation.id = 50L;
            return reservation;
        });
        when(reservationItems.findByReservationId(50L)).thenReturn(List.of());

        var view = service.createReservation(user(), new ReservationInput(eventBooth.id, List.of(new LineInput(product.id, 2))));

        assertThat(view.id()).isEqualTo(50L);
        assertThat(view.reservationNo()).startsWith("RSV-");
        assertThat(product.stockQuantity).isEqualTo(8);
        verify(reservations).save(any(Reservation.class));
    }

    @Test
    void exposesReservationWindowInEventView() {
        Event event = publishedEvent();
        event.reservationStartAt = Instant.parse("2026-08-01T00:00:00Z");
        event.reservationEndAt = Instant.parse("2026-08-07T00:00:00Z");
        when(events.findById(event.id)).thenReturn(Optional.of(event));
        when(eventBooths.findAllByOrderByIdDesc()).thenReturn(List.of());

        var view = service.adminEvent(event.id);

        assertThat(view.reservationStartAt()).isEqualTo(event.reservationStartAt);
        assertThat(view.reservationEndAt()).isEqualTo(event.reservationEndAt);
    }

    @Test
    void rejectsProductManagementForPendingApplication() {
        UserAccount owner = user();
        EventBooth eventBooth = stubOwnedEventBooth(owner, ApplicationStatus.PENDING);

        ProductInput input = new ProductInput("상품", "", null, 1000, StockMode.FINITE, 10, false, true, true);

        assertThatThrownBy(() -> service.createProduct(owner, eventBooth.id, input))
            .isInstanceOf(ApiException.class)
            .hasMessage("승인된 행사 부스만 관리할 수 있습니다.");
    }

    @Test
    void rejectsNoticeManagementForRejectedApplication() {
        UserAccount owner = user();
        EventBooth eventBooth = stubOwnedEventBooth(owner, ApplicationStatus.REJECTED);

        assertThatThrownBy(() -> service.createNotice(owner, eventBooth.id, new NoticeInput("공지", "내용", false)))
            .isInstanceOf(ApiException.class)
            .hasMessage("승인된 행사 부스만 관리할 수 있습니다.");
    }

    @Test
    void rejectsPosSaleForPendingApplication() {
        UserAccount owner = user();
        EventBooth eventBooth = stubOwnedEventBooth(owner, ApplicationStatus.PENDING);
        PosInput input = new PosInput(eventBooth.id, PaymentMethod.CASH, List.of(new LineInput(1L, 1)));

        assertThatThrownBy(() -> service.createPos(owner, input))
            .isInstanceOf(ApiException.class)
            .hasMessage("승인된 행사 부스만 관리할 수 있습니다.");
    }

    @Test
    void listsOnlyApprovedEventBoothsForCreatorManagement() {
        UserAccount owner = user();
        owner.displayName = "크리에이터";
        Booth booth = new Booth();
        booth.id = 40L;
        booth.ownerUserId = owner.id;
        booth.name = "승인 부스";
        booth.description = "소개";
        EventBooth approved = approvedEventBooth();
        EventBooth pending = approvedEventBooth();
        pending.id = 31L;
        pending.status = ApplicationStatus.PENDING;
        when(booths.findByOwnerUserIdOrderByIdDesc(owner.id)).thenReturn(List.of(booth));
        when(eventBooths.findByBoothIdIn(List.of(booth.id))).thenReturn(List.of(pending, approved));
        when(booths.findById(booth.id)).thenReturn(Optional.of(booth));
        when(users.findById(owner.id)).thenReturn(Optional.of(owner));
        when(eventProducts.findByEventBoothIdOrderByIdDesc(approved.id)).thenReturn(List.of());
        when(notices.findByEventBoothIdOrderByPinnedDescCreatedAtDesc(approved.id)).thenReturn(List.of());

        var result = service.creatorEventBooths(owner);

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().id()).isEqualTo(approved.id);
        assertThat(result.getFirst().status()).isEqualTo(ApplicationStatus.APPROVED);
    }

    @Test
    void updatesOwnedApprovedEventBoothInformation() {
        UserAccount owner = user();
        owner.displayName = "크리에이터";
        EventBooth eventBooth = stubOwnedEventBooth(owner, ApplicationStatus.APPROVED);
        Event event = publishedEvent();
        Booth booth = new Booth();
        booth.id = eventBooth.boothId;
        booth.ownerUserId = owner.id;
        booth.name = "기본 부스";
        when(events.findById(event.id)).thenReturn(Optional.of(event));
        when(users.findById(owner.id)).thenReturn(Optional.of(owner));
        when(eventBooths.save(eventBooth)).thenReturn(eventBooth);
        when(eventProducts.findByEventBoothIdOrderByIdDesc(eventBooth.id)).thenReturn(List.of());
        when(notices.findByEventBoothIdOrderByPinnedDescCreatedAtDesc(eventBooth.id)).thenReturn(List.of());

        var view = service.updateEventBooth(owner, eventBooth.id, new EventBoothInput(" A-17 ", "행사 소개", false));

        assertThat(view.boothNumber()).isEqualTo("A-17");
        assertThat(view.intro()).isEqualTo("행사 소개");
        assertThat(view.isPublic()).isFalse();
        verify(eventBooths).save(eventBooth);
    }

    @Test
    void deletesUnusedOwnedEventBoothButKeepsBaseBooth() {
        UserAccount owner = user();
        EventBooth eventBooth = stubOwnedEventBooth(owner, ApplicationStatus.APPROVED);
        Event event = publishedEvent();
        when(events.findById(event.id)).thenReturn(Optional.of(event));
        when(eventProducts.findByEventBoothIdOrderByIdDesc(eventBooth.id)).thenReturn(List.of());
        when(notices.findByEventBoothIdOrderByPinnedDescCreatedAtDesc(eventBooth.id)).thenReturn(List.of());

        service.deleteEventBooth(owner, eventBooth.id);

        verify(eventBooths).delete(eventBooth);
        verify(booths, never()).delete(any(Booth.class));
    }

    @Test
    void rejectsEventBoothDeletionWhenReservationsExist() {
        UserAccount owner = user();
        EventBooth eventBooth = stubOwnedEventBooth(owner, ApplicationStatus.APPROVED);
        Event event = publishedEvent();
        when(events.findById(event.id)).thenReturn(Optional.of(event));
        when(reservations.countByEventBoothId(eventBooth.id)).thenReturn(1L);

        assertThatThrownBy(() -> service.deleteEventBooth(owner, eventBooth.id))
            .isInstanceOf(ApiException.class)
            .hasMessage("예약 또는 판매가 연결된 행사 부스는 삭제할 수 없습니다.");

        verify(eventBooths, never()).delete(eventBooth);
    }

    @Test
    void rejectsEventBoothDeletionWhenPosSalesExist() {
        UserAccount owner = user();
        EventBooth eventBooth = stubOwnedEventBooth(owner, ApplicationStatus.APPROVED);
        Event event = publishedEvent();
        when(events.findById(event.id)).thenReturn(Optional.of(event));
        when(posSales.countByEventBoothId(eventBooth.id)).thenReturn(1L);

        assertThatThrownBy(() -> service.deleteEventBooth(owner, eventBooth.id))
            .isInstanceOf(ApiException.class)
            .hasMessage("예약 또는 판매가 연결된 행사 부스는 삭제할 수 없습니다.");

        verify(eventBooths, never()).delete(eventBooth);
    }

    @Test
    void returnsOwnedPosSaleDetail() {
        UserAccount owner = user();
        Booth booth = new Booth();
        booth.id = 21L;
        booth.ownerUserId = owner.id;
        EventBooth eventBooth = new EventBooth();
        eventBooth.id = 31L;
        eventBooth.boothId = booth.id;
        PosSale sale = new PosSale();
        sale.id = 41L;
        sale.eventBoothId = eventBooth.id;
        sale.saleNo = "POS-TEST-001";
        PosSaleItem line = new PosSaleItem();
        line.id = 51L;
        line.posSaleId = sale.id;
        line.eventProductId = 61L;
        line.quantity = 2;
        line.unitPrice = 12_000L;
        EventProduct eventProduct = new EventProduct();
        eventProduct.id = line.eventProductId;
        eventProduct.productId = 71L;
        Product product = new Product();
        product.id = eventProduct.productId;
        product.name = "아크릴 키링";
        when(booths.findByOwnerUserIdOrderByIdDesc(owner.id)).thenReturn(List.of(booth));
        when(eventBooths.findByBoothIdIn(List.of(booth.id))).thenReturn(List.of(eventBooth));
        when(posSales.findById(sale.id)).thenReturn(Optional.of(sale));
        when(posItems.findByPosSaleId(sale.id)).thenReturn(List.of(line));
        when(eventProducts.findById(eventProduct.id)).thenReturn(Optional.of(eventProduct));
        when(products.findById(product.id)).thenReturn(Optional.of(product));

        var view = service.posSale(owner, sale.id);

        assertThat(view.id()).isEqualTo(sale.id);
        assertThat(view.saleNo()).isEqualTo("POS-TEST-001");
        assertThat(view.totalAmount()).isEqualTo(24_000L);
        assertThat(view.items()).singleElement().satisfies(item -> {
            assertThat(item.productName()).isEqualTo("아크릴 키링");
            assertThat(item.quantity()).isEqualTo(2);
            assertThat(item.unitPrice()).isEqualTo(12_000L);
        });
    }

    @Test
    void rejectsAnotherOwnersPosSaleDetail() {
        UserAccount owner = user();
        PosSale sale = new PosSale();
        sale.id = 41L;
        sale.eventBoothId = 999L;
        when(posSales.findById(sale.id)).thenReturn(Optional.of(sale));
        when(booths.findByOwnerUserIdOrderByIdDesc(owner.id)).thenReturn(List.of());

        assertThatThrownBy(() -> service.posSale(owner, sale.id))
            .isInstanceOf(ApiException.class)
            .hasMessage("다른 부스의 판매 기록입니다.");
    }

    @Test
    void rejectsReversedReservationWindow() {
        Instant start = Instant.parse("2026-08-10T00:00:00Z");
        Instant end = Instant.parse("2026-08-09T00:00:00Z");
        EventInput input = new EventInput("행사", Instant.parse("2026-08-08T00:00:00Z"),
            Instant.parse("2026-08-11T00:00:00Z"), "장소", "", null, start, end, EventStatus.DRAFT);

        assertThatThrownBy(() -> service.createEvent(input))
            .isInstanceOf(ApiException.class)
            .hasMessage("예약 시작은 예약 종료보다 빨라야 합니다.");
    }

    private UserAccount user() {
        UserAccount user = new UserAccount();
        user.id = 10L;
        return user;
    }

    private Event publishedEvent() {
        Event event = new Event();
        event.id = 20L;
        event.status = EventStatus.PUBLISHED;
        event.startAt = Instant.parse("2026-08-01T00:00:00Z");
        event.endAt = Instant.parse("2026-08-31T00:00:00Z");
        event.name = "행사";
        event.venue = "장소";
        return event;
    }

    private EventBooth approvedEventBooth() {
        EventBooth eventBooth = new EventBooth();
        eventBooth.id = 30L;
        eventBooth.eventId = 20L;
        eventBooth.boothId = 40L;
        eventBooth.status = ApplicationStatus.APPROVED;
        eventBooth.isPublic = true;
        return eventBooth;
    }

    private EventProduct reservableProduct(Long eventBoothId) {
        EventProduct product = new EventProduct();
        product.id = 60L;
        product.eventBoothId = eventBoothId;
        product.productId = 70L;
        product.price = 1000;
        product.stockMode = StockMode.FINITE;
        product.stockQuantity = 10;
        product.isPublic = true;
        product.reservationEnabled = true;
        return product;
    }

    private EventBooth stubOwnedEventBooth(UserAccount owner, ApplicationStatus status) {
        EventBooth eventBooth = approvedEventBooth();
        eventBooth.status = status;
        Booth booth = new Booth();
        booth.id = eventBooth.boothId;
        booth.ownerUserId = owner.id;
        when(eventBooths.findById(eventBooth.id)).thenReturn(Optional.of(eventBooth));
        when(booths.findById(booth.id)).thenReturn(Optional.of(booth));
        return eventBooth;
    }
}
