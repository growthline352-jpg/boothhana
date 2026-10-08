package com.boothhana.interests;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
class InterestFeedTests {
 @Test void saleLabelsRespectWithdrawalAndVerification(){
  var verified=Map.<String,Object>of("state","CONFIRMED_CURRENT");
  assertEquals("판매 취소",InterestFeed.saleLabel(Map.of("saleState","CANCELED","evidenceScope","EVENT_SALE_CONFIRMED"),verified));
  assertEquals("품절 안내",InterestFeed.saleLabel(Map.of("saleState","SOLD_OUT","evidenceScope","EVENT_SALE_CONFIRMED"),verified));
  assertEquals("판매 정보 재확인 필요",InterestFeed.saleLabel(Map.of("evidenceScope","EVENT_SALE_CONFIRMED"),Map.of("state","NOT_RECONFIRMED")));
  assertEquals("관련 판매 정보 · 확인 필요",InterestFeed.saleLabel(Map.of("evidenceScope","EVENT_SALE_CONFIRMED"),Map.of()));
  assertEquals("관심 굿즈 판매 확인",InterestFeed.saleLabel(Map.of("evidenceScope","EVENT_SALE_CONFIRMED"),verified));
 }
}
