package com.boothhana.support;

import java.util.Map;

/** Mirrors the editing boundary without granting authority; writes still recheck it. */
public final class OwnerEditCapabilities {
 private OwnerEditCapabilities() {}
 public static Map<String,Object> of(String permission,int currentMembers,int publicMembers,boolean sales) {
  boolean single=currentMembers==1&&publicMembers==1;
  boolean editable="CATALOG_EDIT".equals(permission)&&single;
  String reason=!"CATALOG_EDIT".equals(permission)?"직접 편집은 운영자 재인증 후 이용할 수 있습니다.":!single?"공동 부스는 본인 업체의 정정 요청으로 처리합니다.":"";
  return Map.of("participant",editable,"sales",editable&&sales,"products",editable&&sales,"reason",reason,
   "salesReason",editable&&!sales?"공개된 판매정보가 없습니다. 새 판매정보는 정정 요청으로 제출해 주세요.":reason);
 }
}
