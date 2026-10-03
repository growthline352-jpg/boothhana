package com.boothhana.collection;
import com.boothhana.api.ApiException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class CatalogDiscoveryControllerTests {
 @Test void closedRolloutCannotReadPublicDiscoveryData(){
  var controller=new CatalogDiscoveryController(null,false,false);
  assertThatThrownBy(()->controller.compare("1")).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->controller.popups("2026-10-04","2026-10-05","")).isInstanceOf(ApiException.class);
 }
}
