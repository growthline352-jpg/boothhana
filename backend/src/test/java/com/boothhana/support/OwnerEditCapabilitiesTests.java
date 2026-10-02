package com.boothhana.support;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class OwnerEditCapabilitiesTests {
 @Test void directLinksRequireOneCurrentAndOnePublishedMember() {
  assertThat(OwnerEditCapabilities.of("CATALOG_EDIT",1,1,true)).containsEntry("participant",true).containsEntry("sales",true).containsEntry("products",true);
  for(int[] counts:new int[][]{{2,1},{1,2},{2,2},{0,1},{1,0}}) {
   var denied=OwnerEditCapabilities.of("CATALOG_EDIT",counts[0],counts[1],true);
   assertThat(denied).containsEntry("participant",false).containsEntry("sales",false).containsEntry("products",false);
   assertThat(denied.get("reason").toString()).isNotBlank();
  }
 }
 @Test void absentSalesStillAllowsSingleBoothProfileEditing() {
  var capabilities=OwnerEditCapabilities.of("CATALOG_EDIT",1,1,false);
  assertThat(capabilities).containsEntry("participant",true).containsEntry("sales",false).containsEntry("products",false);
  assertThat(capabilities.get("salesReason").toString()).contains("정정 요청");
 }
 @Test void LegacyAndMissingPermissionsNeverGainDirectEditing() {
  for(String permission:new String[]{"LEGACY","READ_ONLY",null}) {
   assertThat(OwnerEditCapabilities.of(permission,1,1,true)).containsEntry("participant",false).containsEntry("sales",false).containsEntry("products",false);
  }
 }
}
