package com.boothhana.service;

import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.ProductInput;
import com.boothhana.domain.*;
import com.boothhana.domain.DomainEnums.*;
import com.boothhana.repository.*;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PlatformServiceSafetyTests {
    private final UserAccountRepository users = mock(UserAccountRepository.class);
    private final EventRepository events = mock(EventRepository.class);
    private final BoothRepository booths = mock(BoothRepository.class);
    private final EventBoothRepository eventBooths = mock(EventBoothRepository.class);
    private final ProductRepository products = mock(ProductRepository.class);
    private final EventProductRepository eventProducts = mock(EventProductRepository.class);
    private final BoothNoticeRepository notices = mock(BoothNoticeRepository.class);
    private final ReservationRepository reservations = mock(ReservationRepository.class);
    private final ReservationItemRepository reservationItems = mock(ReservationItemRepository.class);
    private final PosSaleRepository sales = mock(PosSaleRepository.class);
    private final PosSaleItemRepository saleItems = mock(PosSaleItemRepository.class);
    private final PlatformService service = new PlatformService(users, events, booths, eventBooths, products,
        eventProducts, notices, reservations, reservationItems, sales, saleItems, "");
    { service.configureTradeRequests(org.mockito.Mockito.mock(TradeRequestService.class)); }

    @Test void posCancellationPreservesApprovedManualStockPolicyAndIsIdempotent() {
        var owner = owner(); var eb = ownedBooth(owner);
        var sale = new PosSale(); sale.id = 3L; sale.eventBoothId = eb.id; sale.status = PosStatus.SOLD;
        when(sales.findByIdForUpdate(3L)).thenReturn(Optional.of(sale));
        when(sales.save(sale)).thenReturn(sale);
        service.cancelPos(owner, 3L); service.cancelPos(owner, 3L);
        assertThat(sale.status).isEqualTo(PosStatus.CANCELED);
        verify(sales, times(1)).save(sale);
        verifyNoInteractions(eventProducts); // No automatic restoration: D-009.
    }
    @Test void repeatedReservationCancellationRestoresOnlyOnce() {
        var owner = owner(); var eb = ownedBooth(owner);
        var reservation = new Reservation(); reservation.id = 5L; reservation.eventBoothId = eb.id;
        reservation.userId = owner.id; reservation.status = ReservationStatus.RESERVED;
        var item = new EventProduct(); item.id = 6L; item.productId = 7L; item.stockMode = StockMode.FINITE; item.stockQuantity = 8;
        var product = new Product(); product.id = 7L; product.name = "테스트";
        var line = new ReservationItem(); line.id = 8L; line.eventProductId = item.id; line.quantity = 2;
        when(reservations.findByIdForUpdate(5L)).thenReturn(Optional.of(reservation));
        when(reservations.save(reservation)).thenReturn(reservation);
        when(reservationItems.findByReservationId(5L)).thenReturn(List.of(line));
        when(eventProducts.findByIdForUpdate(6L)).thenReturn(Optional.of(item));
        when(eventProducts.findById(6L)).thenReturn(Optional.of(item));
        when(products.findById(7L)).thenReturn(Optional.of(product));
        service.cancelReservation(owner, 5L); service.cancelReservation(owner, 5L);
        assertThat(item.stockQuantity).isEqualTo(10);
        assertThat(reservation.status).isEqualTo(ReservationStatus.CANCELED);
        verify(eventProducts, times(1)).save(item);
    }
    @Test void staleProductFormCannotOverwriteCurrentStock() {
        var owner = owner(); var eb = ownedBooth(owner);
        var item = new EventProduct(); item.id = 6L; item.eventBoothId = eb.id; item.version = 4;
        when(eventProducts.findByIdForUpdate(6L)).thenReturn(Optional.of(item));
        var input = new ProductInput("상품", "", null, 1000, StockMode.FINITE, 10, false, true, true, 3L);
        assertThatThrownBy(() -> service.updateProduct(owner, 6L, input)).isInstanceOf(ApiException.class).hasMessageContaining("변경되었습니다");
        verify(eventProducts, never()).saveAndFlush(any());
    }
    @Test void changedBaseProductRevisionRejectsMetadataOnlyStaleForm() {
        var owner=owner();var eb=ownedBooth(owner);
        var item=new EventProduct();item.id=6L;item.eventBoothId=eb.id;item.productId=7L;item.version=0;
        var product=new Product();product.id=7L;product.version=1;product.name="이미 변경됨";
        when(eventProducts.findByIdForUpdate(6L)).thenReturn(Optional.of(item));
        when(products.findByIdForUpdate(7L)).thenReturn(Optional.of(product));
        var input=new ProductInput("오래된 이름","",null,1000,StockMode.FINITE,10,false,true,true,0L,0L);
        assertThatThrownBy(()->service.updateProduct(owner,6L,input)).isInstanceOf(ApiException.class).hasMessageContaining("변경되었습니다");
        verify(products,never()).saveAndFlush(any());
    }
    @Test void editingEventVenuePreservesImageWhenKeyWasOmitted() {
        var event=new Event();event.id=10L;event.imageKey="legacy/event.png";
        when(events.findById(10L)).thenReturn(Optional.of(event));when(events.save(event)).thenReturn(event);
        var input=new com.boothhana.api.ApiModels.EventInput("행사",Instant.now(),Instant.now().plusSeconds(3600),
            "새 장소","",null,null,null,EventStatus.PUBLISHED);
        var view=service.updateEvent(10L,input);
        assertThat(event.imageKey).isEqualTo("legacy/event.png");
        assertThat(view.imageKey()).isEqualTo("legacy/event.png");
    }
    @Test void eventImageCanBeRemovedExplicitly() {
        var event=new Event();event.id=10L;event.imageKey="legacy/event.png";
        when(events.findById(10L)).thenReturn(Optional.of(event));when(events.save(event)).thenReturn(event);
        var input=new com.boothhana.api.ApiModels.EventInput("행사",Instant.now(),Instant.now().plusSeconds(3600),
            "장소","",event.imageKey,null,null,EventStatus.PUBLISHED,true);
        service.updateEvent(10L,input);assertThat(event.imageKey).isNull();
    }
    private UserAccount owner() { var owner = new UserAccount(); owner.id = 1L; return owner; }
    private EventBooth ownedBooth(UserAccount owner) {
        var booth = new Booth(); booth.id = 2L; booth.ownerUserId = owner.id; booth.name = "부스";
        var eb = new EventBooth(); eb.id = 4L; eb.boothId = booth.id; eb.eventId = 9L; eb.status = ApplicationStatus.APPROVED;
        var event = new Event(); event.id = 9L; event.name = "행사"; event.status = EventStatus.PUBLISHED;
        event.startAt = Instant.now(); event.endAt = Instant.now().plusSeconds(3600);
        when(booths.findByOwnerUserIdOrderByIdDesc(owner.id)).thenReturn(List.of(booth));
        when(booths.findById(2L)).thenReturn(Optional.of(booth));
        when(eventBooths.findByBoothIdIn(List.of(2L))).thenReturn(List.of(eb));
        when(eventBooths.findById(4L)).thenReturn(Optional.of(eb));
        when(events.findById(9L)).thenReturn(Optional.of(event));
        return eb;
    }
}
