package com.boothhana.collection;

import com.boothhana.api.ApiException;
import com.boothhana.domain.UserAccount;
import com.boothhana.security.CurrentUser;
import com.boothhana.support.SupportRateLimiter;
import com.boothhana.support.SupportRules;
import com.boothhana.support.SupportModels.Create;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class EventCommentsTests {
 @Test void rejectsEmptyOversizedAndInvalidComments() {
  for(String body:List.of("   ","a".repeat(2001),"hello\0world"))
   assertThatThrownBy(()->EventComments.validate(new EventComments.Input(UUID.randomUUID(),body))).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->EventComments.validate(new EventComments.Input(null,"hello"))).isInstanceOf(ApiException.class);
  assertThat(EventComments.validate(new EventComments.Input(UUID.randomUUID(),"  후기입니다  "))).isEqualTo("후기입니다");
 }
 @Test void rejectsBlockedLanguageAfterNormalization() {
  for(String body:List.of("씨발", "씨 . 발", "씨\u200B발", "씨발", "ㅅ ㅂ", "개-새끼", "병 신", "섹 스", "야동"))
   assertThatThrownBy(()->EventComments.validate(new EventComments.Input(UUID.randomUUID(),body)))
       .isInstanceOf(ApiException.class).hasMessage("댓글을 등록하지 못했습니다.");
 }
 @Test void keepsOrdinaryCommentsAndTheirOriginalText() {
  for(String body:List.of("행사의 시발점이 된 부스였어요", "부스를 보지 못해 아쉬웠어요", "행사 정보 고맙습니다!"))
   assertThat(EventComments.validate(new EventComments.Input(UUID.randomUUID(),"  "+body+"  "))).isEqualTo(body);
 }
 @Test void blockedCommentNeverReachesDatabase() {
  var db=mock(JdbcTemplate.class);var publications=mock(CatalogPublicationService.class);
  var current=mock(CurrentUser.class);var limits=mock(SupportRateLimiter.class);
  var auth=mock(Authentication.class);var user=new UserAccount();user.id=1L;
  when(current.require(auth)).thenReturn(user);
  var controller=new EventComments(db,publications,current,limits);
  assertThatThrownBy(()->controller.create(auth,42L,new EventComments.Input(UUID.randomUUID(),"씨.발")))
      .isInstanceOf(ApiException.class).hasMessage("댓글을 등록하지 못했습니다.");
  verifyNoInteractions(db,publications,limits);
 }
 @Test void unpublishedEventCannotExposeComments() {
  var db=mock(JdbcTemplate.class);var publications=mock(CatalogPublicationService.class);
  when(publications.findPublicDetail(42L)).thenReturn(Optional.empty());
  var controller=new EventComments(db,publications,mock(CurrentUser.class),mock(SupportRateLimiter.class));
  assertThatThrownBy(()->controller.list(42,0)).isInstanceOf(ApiException.class);
  verifyNoInteractions(db);
 }
 @Test void dfestaReviewsCombineBothPublishedDaysWithoutLosingOriginalEventIds() {
  var db=mock(JdbcTemplate.class);var publications=mock(CatalogPublicationService.class);
  when(publications.findPublicDetail(1L)).thenReturn(Optional.of(Map.of("event",Map.of("name","제35회 디. 페스타"))));
  when(db.queryForList(contains("snapshot_json->'event'"),eq(String.class),eq(1L),eq(7L)))
      .thenReturn(List.of("제35회 디. 페스타 토요일","제35회 디. 페스타 일요일"));
  var sundayComment=Map.<String,Object>of("id",UUID.randomUUID(),"eventId",7L);
  when(db.queryForList(contains("from event_comment c"),eq(1L),eq(7L),eq(0))).thenReturn(List.of(sundayComment));
  when(db.queryForObject(contains("count(*) from event_comment"),eq(Long.class),eq(1L),eq(7L))).thenReturn(1L);
  var controller=new EventComments(db,publications,mock(CurrentUser.class),mock(SupportRateLimiter.class));
  var result=controller.list(1,0);
  assertThat(result.get("items")).isEqualTo(List.of(sundayComment));
  assertThat(result.get("total")).isEqualTo(1L);
 }
 @Test void unrelatedOrUnpublishedSecondDayDoesNotJoinReviews() {
  var db=mock(JdbcTemplate.class);var publications=mock(CatalogPublicationService.class);
  when(publications.findPublicDetail(1L)).thenReturn(Optional.of(Map.of("event",Map.of("name","제35회 디. 페스타"))));
  when(db.queryForList(contains("snapshot_json->'event'"),eq(String.class),eq(1L),eq(7L)))
      .thenReturn(List.of("제35회 디. 페스타 토요일"));
  when(db.queryForList(contains("from event_comment c"),eq(1L),eq(1L),eq(0))).thenReturn(List.of());
  when(db.queryForObject(contains("count(*) from event_comment"),eq(Long.class),eq(1L),eq(1L))).thenReturn(0L);
  var controller=new EventComments(db,publications,mock(CurrentUser.class),mock(SupportRateLimiter.class));
  assertThat(controller.list(1,0).get("total")).isEqualTo(0L);
  verify(db,never()).queryForList(contains("from event_comment c"),eq(1L),eq(7L),eq(0));
 }
 @Test void eventRequestUsesExistingPrivateInquiryWorkflow() {
  assertThatCode(()->SupportRules.create(new Create(UUID.randomUUID(),"INQUIRY","EVENT_REQUEST","행사명","10월 3일 서울 개최",List.of("https://example.com/event"),null,Map.of(),null))).doesNotThrowAnyException();
  assertThatThrownBy(()->SupportRules.create(new Create(UUID.randomUUID(),"REPORT","EVENT_REQUEST","행사명","내용",List.of(),null,Map.of(),null))).isInstanceOf(IllegalArgumentException.class);
 }
}
