package com.boothhana.collection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class CatalogTaxonomyTests {
    @Test void subculturePerformancesAreNotFestivalMusic() {
        assertThat(CatalogTaxonomy.category("SUBCULTURE_MUSIC")).isEqualTo("SUBCULTURE");
        assertThat(CatalogTaxonomy.category("MUSIC")).isEqualTo("FESTIVAL");
        assertThat(new CatalogBrowseQuery(0, 20, "SUBCULTURE", "", "SUBCULTURE_MUSIC", "", "", "RECENT").whereArgs())
            .contains("SUBCULTURE_MUSIC");
        assertThatThrownBy(() -> new CatalogBrowseQuery(0, 20, "FESTIVAL", "", "SUBCULTURE_MUSIC", "", "", "RECENT"))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
