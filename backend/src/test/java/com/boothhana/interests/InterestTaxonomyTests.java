package com.boothhana.interests;

import com.boothhana.api.ApiException;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class InterestTaxonomyTests {
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
