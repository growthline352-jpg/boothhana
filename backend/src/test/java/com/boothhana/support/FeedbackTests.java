package com.boothhana.support;

import com.boothhana.api.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.support.SupportModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class FeedbackTests {
 private static final String KEY="a".repeat(43), SECRET="isolated-feedback-test-only-secret";
 private GuestCreate input(String category,Target target,Map<String,String> context,List<String> evidence,String website) {
  return new GuestCreate(new Create(UUID.randomUUID(),"INQUIRY",category,"캘린더 개선","이전 달 일정도 보고 싶습니다.",evidence,target,context,null),KEY,website);
 }
 @Test void feedbackAcceptsAnonymousSuggestionsButNotPrivateAccountRequestsOrLinkedTargets() {
  assertThatCode(()->SupportRules.feedback(input("FEATURE_REQUEST",null,Map.of("pagePath","/discover"),List.of(),""))).doesNotThrowAnyException();
  assertThatThrownBy(()->SupportRules.feedback(input("ACCOUNT",null,Map.of(),List.of(),""))).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->SupportRules.feedback(input("FEATURE_REQUEST",new Target("PLATFORM","RESERVATION",0,1L,null,null,null,null),Map.of(),List.of(),""))).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->SupportRules.feedback(input("FEATURE_REQUEST",null,Map.of(),List.of("https://example.com"),""))).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void feedbackRejectsHoneypotsAndPrivateQueryContext() {
  for(String path:List.of("//example.com","/login?token=private","/path#private","/path\\private","/path\nprivate"))
   assertThatThrownBy(()->SupportRules.feedback(input("FEATURE_REQUEST",null,Map.of("pagePath",path),List.of(),""))).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->SupportRules.feedback(input("FEATURE_REQUEST",null,Map.of("errorCode","private"),List.of(),""))).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->SupportRules.feedback(input("FEATURE_REQUEST",null,Map.of(),List.of(),"https://bot.example"))).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void feedbackHasSeparateAvailabilityFromGuestAccountSupport() {
  var service=new SupportService(mock(JdbcTemplate.class),JsonMapper.builder().build(),mock(SupportTargets.class),mock(SupportRateLimiter.class),false,SECRET);
  assertThat(service.capabilities()).containsEntry("feedbackEnabled",true).containsEntry("guestEnabled",false);
  var disabled=new SupportService(mock(JdbcTemplate.class),JsonMapper.builder().build(),mock(SupportTargets.class),mock(SupportRateLimiter.class),false,"");
  assertThat(disabled.capabilities()).containsEntry("feedbackEnabled",false);
  assertThatThrownBy(()->disabled.feedbackCreate(input("FEATURE_REQUEST",null,Map.of(),List.of(),""),"127.0.0.1")).isInstanceOf(ApiException.class);
 }
 @Test void feedbackConsumesAdmissionBeforeTheBusinessWriteAndSharesGuestQuota() {
  var service=mock(SupportService.class);var rates=mock(SupportRateLimiter.class);var facade=new SupportOperations(service,rates,mock(SupportResolutionService.class),mock(ExhibitorClaimsService.class),SECRET);
  var input=input("FEATURE_REQUEST",null,Map.of(),List.of(),"");
  facade.feedbackCreate(input,"127.0.0.1");var order=inOrder(rates,service);order.verify(rates).hit("guest-create:"+SECRET+":127.0.0.1");order.verify(service).feedbackCreate(input,"127.0.0.1");
  reset(service);when(rates.hit(anyString())).thenReturn(6);
  assertThatThrownBy(()->facade.feedbackCreate(input,"127.0.0.1")).isInstanceOf(ApiException.class);verifyNoInteractions(service);
 }
}
