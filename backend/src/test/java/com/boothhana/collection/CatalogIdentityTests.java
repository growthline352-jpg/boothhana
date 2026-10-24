package com.boothhana.collection;

import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;
import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.api.Test;

class CatalogIdentityTests {
    private Participant observed(String entry,String name,String... urls) {
        return new Participant(entry,name,"CIRCLE",List.of(),List.of(),List.of(),null,List.of(),
            java.util.Arrays.stream(urls).map(u->new Source(u,"OFFICIAL","ORIGINAL","Official registration detail")).toList(),List.of(),List.of());
    }
    private java.util.Map<String,Object> legacyRow(long id,Participant p) {
        var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
        return java.util.Map.of("id",id,"identity_key",CollectionRules.sha("old-v4-import:"+id),"identity_aliases","[]","payload_json",mapper.writeValueAsString(p));
    }
    @Test void realParticipantIdsWithTheSameDisplayNameHaveDifferentPrimaryKeys() {
        var first=observed("179410","-","https://dongne.co/events/example/circles/179410");
        var second=observed("176131","-","https://dongne.co/events/example/circles/176131");
        assertThat(CatalogIdentity.participantKeys(first).getFirst()).isNotEqualTo(CatalogIdentity.participantKeys(second).getFirst());
    }
    @Test void legacyObservationCanRecoverOnlyTheOriginalOfficialDetailIdentity() {
        var old=observed("obs_75ea4d89b3e35a36","Old registration","https://dongne.co/events/example/circles/179410");
        var incoming=observed("179410","Renamed registration","https://dongne.co/events/example/circles");
        var row=legacyRow(341,old);var index=new CatalogIdentityIndex(tools.jackson.databind.json.JsonMapper.builder().build());
        assertThat(index.match(List.of(row),CatalogIdentity.participantKeys(incoming),CatalogIdentity.known(incoming.identity(),incoming.sourceEntryId(),incoming.sources()),false)).isSameAs(row);
    }
    @Test void legacyIdenticallyNamedObservationsAreDisambiguatedByOfficialDetailUrls() {
        var first=legacyRow(341,observed("obs_75ea4d89b3e35a36","-","https://dongne.co/events/example/circles/179410"));
        var second=legacyRow(342,observed("obs_f6481c5fafb6fe0d","-","https://dongne.co/events/example/circles/174426"));
        var incoming=observed("179410","-","https://dongne.co/events/example/circles");
        var index=new CatalogIdentityIndex(tools.jackson.databind.json.JsonMapper.builder().build());
        assertThat(index.match(List.of(first,second),CatalogIdentity.participantKeys(incoming),CatalogIdentity.known(incoming.identity(),incoming.sourceEntryId(),incoming.sources()),false)).isSameAs(first);
    }
    @Test void conflictingOriginalRegistrationUrlsAreNotSilentlyAdopted() {
        var old=legacyRow(341,observed("obs_75ea4d89b3e35a36","Old combined label","https://dongne.co/events/example/circles/179410","https://dongne.co/events/example/circles/174426"));
        var incoming=observed("179410","Renamed registration","https://dongne.co/events/example/circles");
        var index=new CatalogIdentityIndex(tools.jackson.databind.json.JsonMapper.builder().build());
        org.assertj.core.api.Assertions.assertThatThrownBy(()->index.match(List.of(old),CatalogIdentity.participantKeys(incoming),CatalogIdentity.known(incoming.identity(),incoming.sourceEntryId(),incoming.sources()),false)).isInstanceOf(com.boothhana.api.ApiException.class);
    }
    @Test void searchSnippetOrLookalikeHostCannotSupplyARegistrationAlias() {
        var index=new CatalogIdentityIndex(tools.jackson.databind.json.JsonMapper.builder().build());
        var incoming=observed("179410","Renamed registration","https://dongne.co/events/example/circles");
        var snippet=observed("obs_75ea4d89b3e35a36","Old registration","https://dongne.co/events/example/circles/179410");
        snippet=new Participant(snippet.sourceEntryId(),snippet.registrationName(),snippet.kind(),snippet.members(),snippet.locations(),snippet.subjects(),snippet.description(),snippet.officialLinks(),List.of(new Source(snippet.sources().getFirst().url(),"OFFICIAL","SEARCH_SNIPPET","Not opened")),snippet.images(),snippet.warnings());
        var impostor=observed("obs_f6481c5fafb6fe0d","Old registration","https://dongne.co.evil.com/events/example/circles/179410");
        for(var p:List.of(snippet,impostor))assertThat(index.match(List.of(legacyRow(341,p)),CatalogIdentity.participantKeys(incoming),CatalogIdentity.known(incoming.identity(),incoming.sourceEntryId(),incoming.sources()),false)).isNull();
    }
    private Participant explicitObservation(Participant p,String origin) {
        return new Participant(p.sourceEntryId(),p.registrationName(),p.kind(),p.members(),p.locations(),p.subjects(),p.description(),p.officialLinks(),java.util.stream.Stream.concat(p.sources().stream(),java.util.stream.Stream.of(new Source(origin+"/events/example/circles","OFFICIAL","ORIGINAL","Original roster"))).toList(),p.images(),p.warnings(),new Identity(origin,p.sourceEntryId(),origin+"/events/example/circles"));
    }
    @Test void explicitLegacyObservationStillAdoptsItsOneVerifiedRegistration() {
        var old=explicitObservation(observed("obs_75ea4d89b3e35a36","Old registration","https://dongne.co/events/example/circles/179410"),"https://dongne.co");
        var incoming=observed("179410","Renamed registration","https://dongne.co/events/example/circles");
        var row=legacyRow(341,old);var index=new CatalogIdentityIndex(tools.jackson.databind.json.JsonMapper.builder().build());
        assertThat(index.match(List.of(row),CatalogIdentity.participantKeys(incoming),CatalogIdentity.participantIdentity(incoming),false)).isSameAs(row);
    }
    @Test void explicitLegacyObservationCannotGuessBetweenTwoOfficialRegistrations() {
        var old=explicitObservation(observed("obs_75ea4d89b3e35a36","Old registration","https://dongne.co/events/example/circles/179410","https://dongne.co/events/example/circles/174426"),"https://dongne.co");
        var incoming=observed("179410","Old registration","https://dongne.co/events/example/circles");
        var index=new CatalogIdentityIndex(tools.jackson.databind.json.JsonMapper.builder().build());
        org.assertj.core.api.Assertions.assertThatThrownBy(()->index.match(List.of(legacyRow(341,old)),CatalogIdentity.participantKeys(incoming),CatalogIdentity.participantIdentity(incoming),false)).isInstanceOf(com.boothhana.api.ApiException.class);
    }
    @Test void explicitObservationInAnotherSystemRemainsThatSystemsIdentity() {
        var p=explicitObservation(observed("obs_75ea4d89b3e35a36","Old registration","https://dongne.co/events/example/circles/179410"),"https://other.example");
        assertThat(CatalogIdentity.participantIdentity(p)).isEqualTo(p.identity());
    }
    @Test void observationDetailAliasesDoNotDependOnOriginalSourceOrder() {
        String a="https://dongne.co/events/edition-a/circles/179410",b="https://dongne.co/events/edition-b/circles/179410";
        assertThat(CatalogIdentity.participantKeys(observed("obs_75ea4d89b3e35a36","Same registration",a,b)))
            .isEqualTo(CatalogIdentity.participantKeys(observed("obs_75ea4d89b3e35a36","Same registration",b,a)));
    }
    private ProductData product(String name,String url,String id) {
        return new ProductData(id,name,null,null,List.of(),List.of(),"GENERAL_CATALOG",null,"UNKNOWN",url,
            List.of(new Source(url,"OFFICIAL","ORIGINAL","판매 옵션")),List.of(),List.of());
    }
    @Test void separatePagesOfSharedFormCannotOverwriteDifferentlyNamedOption() {
        var prior=product("Option A","https://example.com/form",null);
        var next=product("Option B","https://example.com/form?utm_source=page2",null);
        assertThat(CatalogIdentity.intersects(CatalogIdentity.productKeys(prior),CatalogIdentity.productKeys(next))).isTrue();
        assertThat(CatalogIdentity.ambiguousProductMatch(prior,next)).isTrue();
        assertThat(CatalogIdentity.ambiguousProductMatch(prior,product("Option A","https://example.com/form",null))).isFalse();
        assertThat(CatalogIdentity.ambiguousProductMatch(product("Old name","https://example.com/form","real-id"),product("New name","https://example.com/form","real-id"))).isFalse();
        assertThat(CatalogIdentity.ambiguousProductMatch(product("Option A","https://example.com/form","real-id"),next)).isTrue();
    }
    @Test void historicalSharedFormAliasCannotOverwriteAnOptionAfterUrlCorrection() {
        var mapper=tools.jackson.databind.json.JsonMapper.builder().build();
        var original=product("Option A","https://example.com/form",null);
        var corrected=product("Option A","https://example.com/product/A",null);
        var next=product("Option C","https://example.com/form",null);
        var row=java.util.Map.<String,Object>of("id",51L,"identity_key",CatalogIdentity.productKeys(original).getFirst(),
            "identity_aliases",mapper.writeValueAsString(CatalogIdentity.productKeys(original)),"payload_json",mapper.writeValueAsString(corrected));
        var found=new CatalogIdentityIndex(mapper).match(List.of(row),CatalogIdentity.productKeys(next),null,true);
        assertThat(found).isSameAs(row);
        assertThat(CatalogIdentity.ambiguousProductMatch(mapper.readValue(found.get("payload_json").toString(),ProductData.class),next)).isTrue();
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
