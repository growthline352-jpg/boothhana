package com.boothhana.collection;

import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static com.boothhana.collection.CatalogModels.*;
import static com.boothhana.collection.CollectionModels.*;
import static org.assertj.core.api.Assertions.*;

class OwnerProductIdentityTests {
 private final JsonMapper json=JsonMapper.builder().build();
 private ProductData product(String name) {
  return new ProductData(null,name,"Collected description",null,List.of(),List.of(),"EVENT_SALE_CONFIRMED",new Price("1000","KRW","2026-09-29",null),"ON_SALE",null,
   List.of(new Source("https://example.com/catalog","OFFICIAL","ORIGINAL","Sale notice")),List.of(),List.of());
 }
 private Sales sales(ProductData... products) {return new Sales("Sale notice","EVENT_SALE_CONFIRMED",List.of(),List.of(),null,products[0].sources(),List.of(),List.of(products),List.of());}
 private Map<String,Object> row(long id,ProductData product,Map<String,Object> overrides) {
  return Map.of("id",id,"identity_key",CatalogRules.productKey(product),"payload_json",json.writeValueAsString(product),"owner_overrides_json",json.writeValueAsString(overrides));
 }
 @Test void legacyRenameRetainsIdentityAndVerificationOnEveryProjection() {
  var collected=product("Original name");var index=new CatalogIdentityIndex(json);
  var record=row(51,collected,Map.of("name","Owner renamed","summary","Owner description","saleState","SOLD_OUT"));
  var check=new ProductCheck("CURRENT","2026-09-29T00:00:00Z");
  for(int i=0;i<2;i++) {
   var projected=index.products(sales(collected),List.of(record),Map.of("51",check)).getFirst();
   assertThat(projected.id()).isEqualTo(51L);
   assertThat(projected.verification()).isEqualTo(check);
   assertThat(projected.data().name()).isEqualTo("Owner renamed");
   assertThat(projected.data().summary()).isEqualTo("Owner description");
   assertThat(projected.data().saleState()).isEqualTo("SOLD_OUT");
  }
  assertThat(json.readValue(record.get("payload_json").toString(),ProductData.class)).isEqualTo(collected);
 }
 @Test void ownerFieldsStayIsolatedAndNewCollectedProductsRemainVisible() {
  ProductData first=product("First"),second=product("Second"),future=product("New collection");
  var overrides=new HashMap<String,Object>();overrides.put("name","Owner first");overrides.put("price",null);
  overrides.put("memberName","Untrusted replacement");overrides.put("evidenceScope","GENERAL_CATALOG");
  var rows=new ArrayList<Map<String,Object>>(List.of(row(51,first,overrides),row(52,second,Map.of())));
  var index=new CatalogIdentityIndex(json);
  assertThat(index.products(sales(first,second),rows,Map.of())).extracting(ProductRow::id).containsExactly(51L,52L);
  rows.add(row(53,future,Map.of()));
  var projected=index.products(sales(first,second,future),rows,Map.of());
  assertThat(projected).extracting(ProductRow::id).containsExactly(51L,52L,53L);
  assertThat(projected.get(0).data().name()).isEqualTo("Owner first");
  assertThat(projected.get(0).data().price()).isNull();
  assertThat(projected.get(0).data().evidenceScope()).isEqualTo(first.evidenceScope());
  assertThat(projected.get(0).data().memberName()).isNull();
  assertThat(projected.get(1).data()).isEqualTo(second);
  assertThat(projected.get(2).data()).isEqualTo(future);
 }
}
