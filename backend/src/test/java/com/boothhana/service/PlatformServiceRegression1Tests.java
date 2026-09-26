package com.boothhana.service;

import com.boothhana.domain.Booth;
import com.boothhana.domain.Event;
import com.boothhana.domain.EventBooth;
import com.boothhana.domain.UserAccount;
import com.boothhana.domain.DomainEnums.ApplicationStatus;
import com.boothhana.domain.DomainEnums.EventStatus;
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
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PlatformServiceRegression1Tests {
    // Regression: ISSUE-001 - applied events looked available after reload
    // Found by /qa on 2026-08-10
    // Report: docs/qa/2026-08-10-localhost-qa-report.md
    @Test
    void creatorEventsExposeTheOwnersApplicationStatus() {
        UserAccountRepository users = mock(UserAccountRepository.class);
        EventRepository events = mock(EventRepository.class);
        BoothRepository booths = mock(BoothRepository.class);
        EventBoothRepository eventBooths = mock(EventBoothRepository.class);
        PlatformService service = new PlatformService(users, events, booths, eventBooths,
            mock(ProductRepository.class), mock(EventProductRepository.class), mock(BoothNoticeRepository.class),
            mock(ReservationRepository.class), mock(ReservationItemRepository.class), mock(PosSaleRepository.class),
            mock(PosSaleItemRepository.class), "");
        service.configureTradeRequests(org.mockito.Mockito.mock(TradeRequestService.class));

        UserAccount owner = new UserAccount();
        owner.id = 7L;
        Booth booth = new Booth();
        booth.id = 11L;
        booth.ownerUserId = owner.id;
        Event appliedEvent = event(21L, "Applied event");
        Event availableEvent = event(22L, "Available event");
        EventBooth application = new EventBooth();
        application.eventId = appliedEvent.id;
        application.boothId = booth.id;
        application.status = ApplicationStatus.PENDING;

        when(booths.findByOwnerUserIdOrderByIdDesc(owner.id)).thenReturn(List.of(booth));
        when(eventBooths.findByBoothIdIn(List.of(booth.id))).thenReturn(List.of(application));
        when(events.findAllByOrderByStartAtDesc()).thenReturn(List.of(appliedEvent, availableEvent));
        when(eventBooths.findAllByOrderByIdDesc()).thenReturn(List.of(application));

        var result = service.creatorEvents(owner);

        assertThat(result).extracting(view -> view.applicationStatus())
            .containsExactly(ApplicationStatus.PENDING, null);
    }

    private Event event(Long id, String name) {
        Event event = new Event();
        event.id = id;
        event.name = name;
        event.startAt = Instant.parse("2026-08-10T00:00:00Z");
        event.endAt = Instant.parse("2026-08-11T00:00:00Z");
        event.venue = "Test venue";
        event.status = EventStatus.PUBLISHED;
        return event;
    }
}
