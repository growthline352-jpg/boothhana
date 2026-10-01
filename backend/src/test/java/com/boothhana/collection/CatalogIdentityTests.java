package com.boothhana.collection;

import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;
import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.api.Test;

class CatalogIdentityTests {
    private ProductData product(String name,String url,String id) {
        return new ProductData(id,name,null,null,List.of(),List.of(),"GENERAL_CATALOG",null,"UNKNOWN",url,
            List.of(new Source(url,"OFFICIAL","ORIGINAL","판매 옵션")),List.of(),List.of());
    }
    @Test void separatePagesOfSharedFormCannotOverwriteDifferentlyNamedOption() {
        var prior=product("Option A","https://example.com/form",null);
        var next=product("Option B","https://example.com/form?utm_source=page2",null);
        assertThat(CatalogIdentity.intersects(CatalogIdentity.productKeys(prior),CatalogIdentity.productKeys(next))).isTrue();
        assertThat(CatalogIdentity.ambiguousProductUrlMatch(prior,next)).isTrue();
        assertThat(CatalogIdentity.ambiguousProductUrlMatch(prior,product("Option A","https://example.com/form",null))).isFalse();
        assertThat(CatalogIdentity.ambiguousProductUrlMatch(product("Old name","https://example.com/form","real-id"),product("New name","https://example.com/form","real-id"))).isFalse();
        assertThat(CatalogIdentity.ambiguousProductUrlMatch(product("Option A","https://example.com/form","real-id"),next)).isTrue();
    }
    private Participant participant(String name,String source,String entry) {
        var sources=List.of(new Source(source,"ORGANIZER_SOCIAL","ORIGINAL","참가 공지"));
        return new Participant(entry,name,"CIRCLE",List.of(),List.of(),List.of(),null,List.of(source),sources,List.of(),List.of(),null);
    }

    @Test void normalizedNameLinksRosterAndSocialObservationWithinOneEvent() {
        var roster=participant("서클 하나","https://event.example/roster","roster-1");
        var social=participant("서클하나","https://x.com/circle/status/1",null);
        assertThat(CatalogIdentity.intersects(CatalogIdentity.participantKeys(roster),CatalogIdentity.participantKeys(social))).isTrue();
    }

    @Test void boothNumberIsNotPartOfParticipantIdentity() {
        var original=participant("서클 하나","https://event.example/roster","roster-1");
        var moved=new Participant(original.sourceEntryId(),original.registrationName(),original.kind(),original.members(),
            List.of(new Location("Z-99","ASSIGNED",null,null,null,null,null)),original.subjects(),original.description(),
            original.officialLinks(),original.sources(),original.images(),original.warnings(),original.identity());
        assertThat(CatalogIdentity.participantKeys(moved)).isEqualTo(CatalogIdentity.participantKeys(original));
    }

    @Test void boothDatesMaySpanAdjacentOccurrenceRows() {
        var original=participant("서클 하나","https://event.example/roster","roster-1");
        var located=new Participant(original.sourceEntryId(),original.registrationName(),original.kind(),original.members(),
            List.of(new Location(null,"UNKNOWN",null,null,"2026-10-01","2026-10-03",null)),original.subjects(),original.description(),
            original.officialLinks(),original.sources(),original.images(),original.warnings(),original.identity());
        var event=new EventData("행사","ONLY_EVENT",null,null,"SEOUL",null,null,null,null,List.of(),List.of(
            new Occurrence("2026-10-01","2026-10-02","11:00","19:00"),
            new Occurrence("2026-10-03","2026-10-03","10:00","18:00")),original.sources(),List.of(),List.of());
        org.assertj.core.api.Assertions.assertThatCode(()->CatalogRules.locationDates(located,event)).doesNotThrowAnyException();
    }
}
