package com.boothhana.interests;

import com.boothhana.api.ApiException;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class InterestTaxonomyTests {
    @Test void fourFieldsAndPopupLegacyFormatsRemainCompatible(){
        var selections=new LinkedHashMap<String,InterestTaxonomy.Selection>();
        for(var field:TaxonomyRegistry.FIELDS)selections.put(field.code(),new InterestTaxonomy.Selection(List.of(),List.of()));
        selections.put("POPUP",new InterestTaxonomy.Selection(List.of("POPUP_RETAIL"),List.of("CHARACTER_IP")));
        assertThat(InterestTaxonomy.validate(selections)).hasSize(4);
        var args=new ArrayList<Object>();InterestTaxonomy.predicate("POPUP",selections.get("POPUP"),"p",args);
        assertThat(args).contains("POPUP_RETAIL","POPUP_STORE","character_ip");
        assertThat(com.boothhana.collection.CatalogTaxonomy.category("POPUP_STORE")).isEqualTo("POPUP");
        assertThat(com.boothhana.collection.CatalogTaxonomy.category("POPUP_EXPERIENCE")).isEqualTo("POPUP");
    }
    @Test void sharedRegistryRetainsSavedCodesAndAddsIndependentTopics() {
        var old=Map.of("EXHIBITION",new InterestTaxonomy.Selection(List.of("FAIR"),List.of("LIFESTYLE")),
            "FESTIVAL",new InterestTaxonomy.Selection(List.of("LIVE"),List.of("MUSIC")));
        assertThat(InterestTaxonomy.validate(old)).isEqualTo(old);
        assertThat(com.boothhana.collection.CatalogTaxonomy.category("FAN_CAFE")).isEqualTo("SUBCULTURE");
        assertThat(com.boothhana.collection.CatalogTaxonomy.category("CONCERT")).isEqualTo("FESTIVAL");
        var pets=InterestTaxonomy.field("EXHIBITION").topics().stream().filter(o->o.code().equals("PETS")).findFirst().orElseThrow();
        assertThat(TaxonomyRegistry.matches(pets,"LIFESTYLE",List.of("반려동물"))).isTrue();
        assertThat(TaxonomyRegistry.matches(pets,"LIFESTYLE",List.of("육아"))).isFalse();
    }
    @Test void reviewedAliasesMatchButAmbiguousMixedMusicDoesNotGuessAGame() {
        var game=InterestTaxonomy.field("SUBCULTURE").topics().stream().filter(o->o.code().equals("GAME")).findFirst().orElseThrow();
        assertThat(TaxonomyRegistry.matches(game,"SUBCULTURE_MUSIC",List.of(" GAME_OST_CONCERT "))).isTrue();
        assertThat(TaxonomyRegistry.matches(game,"SUBCULTURE_MUSIC",List.of("ANIME_GAME_MUSIC"))).isFalse();
        assertThat(game.works()).contains("페르소나");
        assertThat(TaxonomyRegistry.reviewIssues("ONLY_EVENT",List.of("ONLY_EVENT"))).hasSize(2);
        assertThat(TaxonomyRegistry.reviewIssues("ONLY_EVENT",List.of("괴담출근"))).isEmpty();
    }
    @Test void categoryCodesCannotCrossFields() {
        assertThatThrownBy(()->InterestTaxonomy.validate(Map.of("SUBCULTURE",new InterestTaxonomy.Selection(List.of("POPUP_STORE"),List.of())))).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->InterestTaxonomy.validate(Map.of("FESTIVAL",new InterestTaxonomy.Selection(List.of(),List.of("VOCALOID"))))).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->InterestTaxonomy.validate(Map.of("SUBCULTURE",new InterestTaxonomy.Selection(List.of("BIRTHDAY_CAFE","BIRTHDAY_CAFE"),List.of())))).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->InterestTaxonomy.validate(Map.of("SUBCULTURE",new InterestTaxonomy.Selection(Arrays.asList((String)null),List.of())))).isInstanceOf(ApiException.class);
    }
    @Test void storedPopupPreferencesMoveWithoutLosingOtherChoicesOrMutatingInput(){
        var old=Map.of("SUBCULTURE",new InterestTaxonomy.Selection(List.of("POPUP_STORE","BIRTHDAY_CAFE"),List.of("GAME")),
            "POPUP",new InterestTaxonomy.Selection(List.of("POPUP_EXPERIENCE"),List.of("BEAUTY")),
            "FESTIVAL",new InterestTaxonomy.Selection(List.of("LIVE"),List.of("JAZZ")));
        var normalized=InterestTaxonomy.normalizeStoredFields(old);
        assertThat(normalized.get("SUBCULTURE")).isEqualTo(new InterestTaxonomy.Selection(List.of("BIRTHDAY_CAFE"),List.of("GAME")));
        assertThat(normalized.get("POPUP").formats()).containsExactly("POPUP_EXPERIENCE","POPUP_RETAIL","POPUP_EXHIBITION","POPUP_MIXED");
        assertThat(normalized.get("POPUP").topics()).containsExactly("BEAUTY");
        assertThat(normalized.get("FESTIVAL")).isEqualTo(old.get("FESTIVAL"));
        assertThat(old.get("SUBCULTURE").formats()).contains("POPUP_STORE");
        assertThat(InterestTaxonomy.validate(normalized)).isEqualTo(normalized);
        assertThat(InterestTaxonomy.normalizeStoredFields(normalized)).isEqualTo(normalized);
        var popupOnly=InterestTaxonomy.normalizeStoredFields(Map.of("SUBCULTURE",new InterestTaxonomy.Selection(List.of("POPUP_STORE"),List.of())));
        assertThat(popupOnly).containsOnlyKeys("POPUP");
    }
    @Test void browseScopesRejectCrossFieldPopupTypesButAcceptLegacyPopupFilter(){
        for(String type:com.boothhana.collection.CatalogTaxonomy.browseTypes("POPUP")){
            assertThatThrownBy(()->new com.boothhana.collection.CatalogBrowseQuery(0,20,"SUBCULTURE","",type,"","","RECENT"))
                .isInstanceOf(IllegalArgumentException.class);
        }
        var popup=new com.boothhana.collection.CatalogBrowseQuery(0,20,"POPUP","","POPUP_RETAIL","","","RECENT");
        assertThat(popup.whereArgs()).contains("POPUP_STORE");
        var sub=new com.boothhana.collection.CatalogBrowseQuery(0,20,"SUBCULTURE","","","","","RECENT");
        assertThat(sub.whereArgs()).doesNotContain("POPUP_STORE","POPUP_RETAIL","POPUP_EXPERIENCE","POPUP_EXHIBITION","POPUP_MIXED");
    }
    @Test void emptySelectedCategoryMeansAllAndSubjectsAreBound() {
        var args=new ArrayList<Object>();
        assertThat(InterestTaxonomy.predicate("FESTIVAL",new InterestTaxonomy.Selection(List.of(),List.of()),"p",args)).isEqualTo("true");
        String sql=InterestTaxonomy.predicate("SUBCULTURE",new InterestTaxonomy.Selection(List.of("BIRTHDAY_CAFE"),List.of("VOCALOID")),"p",args);
        assertThat(sql).contains(" or ","topic.value").doesNotContain("VOCALOID","BIRTHDAY_CAFE");
        assertThat(args).contains("BIRTHDAY_CAFE","vocaloid");
    }
    @Test void subcultureLiveFormatDoesNotUseGeneralFestivalMusic() {
        var args=new ArrayList<Object>();
        InterestTaxonomy.predicate("SUBCULTURE",new InterestTaxonomy.Selection(List.of("SUBCULTURE_MUSIC"),List.of()),"p",args);
        assertThat(args).containsExactly("SUBCULTURE_MUSIC","subculture_music");
        assertThatThrownBy(()->InterestTaxonomy.validate(Map.of("FESTIVAL",new InterestTaxonomy.Selection(List.of("SUBCULTURE_MUSIC"),List.of())))).isInstanceOf(ApiException.class);
    }
}
