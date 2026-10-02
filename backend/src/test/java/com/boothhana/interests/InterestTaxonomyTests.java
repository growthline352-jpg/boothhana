package com.boothhana.interests;

import com.boothhana.api.ApiException;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class InterestTaxonomyTests {
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
        assertThatThrownBy(()->InterestTaxonomy.validate(Map.of("FESTIVAL",new InterestTaxonomy.Selection(List.of(),List.of("VOCALOID"))))).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->InterestTaxonomy.validate(Map.of("SUBCULTURE",new InterestTaxonomy.Selection(List.of("BIRTHDAY_CAFE","BIRTHDAY_CAFE"),List.of())))).isInstanceOf(ApiException.class);
        assertThatThrownBy(()->InterestTaxonomy.validate(Map.of("SUBCULTURE",new InterestTaxonomy.Selection(Arrays.asList((String)null),List.of())))).isInstanceOf(ApiException.class);
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
