package com.boothhana.collection;

import com.boothhana.api.ApiException;
import com.boothhana.security.CurrentUser;
import com.boothhana.support.SupportRateLimiter;
import com.boothhana.support.SupportRules;
import com.boothhana.support.SupportModels.Create;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
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
 @Test void unpublishedEventCannotExposeComments() {
  var db=mock(JdbcTemplate.class);var publications=mock(CatalogPublicationService.class);
  when(publications.findPublicDetail(42L)).thenReturn(Optional.empty());
  var controller=new EventComments(db,publications,mock(CurrentUser.class),mock(SupportRateLimiter.class));
  assertThatThrownBy(()->controller.list(42,0)).isInstanceOf(ApiException.class);
  verifyNoInteractions(db);
 }
 @Test void eventRequestUsesExistingPrivateInquiryWorkflow() {
  assertThatCode(()->SupportRules.create(new Create(UUID.randomUUID(),"INQUIRY","EVENT_REQUEST","행사명","10월 3일 서울 개최",List.of("https://example.com/event"),null,Map.of(),null))).doesNotThrowAnyException();
  assertThatThrownBy(()->SupportRules.create(new Create(UUID.randomUUID(),"REPORT","EVENT_REQUEST","행사명","내용",List.of(),null,Map.of(),null))).isInstanceOf(IllegalArgumentException.class);
 }
}
