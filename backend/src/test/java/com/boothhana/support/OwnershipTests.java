package com.boothhana.support;
import com.boothhana.api.ApiException;
import com.boothhana.collection.CatalogService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.boothhana.support.SupportModels.*;

class OwnershipTests {
 private Create organizer(Target target,Long exhibitor,List<String> evidence){return new Create(UUID.randomUUID(),"CLAIM","ORGANIZER","주최 단체","담당자와 운영 계정 소유 증빙",evidence,target,Map.of(),exhibitor);}
 private final Target event=new Target("CATALOG","EVENT",10,10L,null,null,null,null);
 @Test void organizerApplicationRequiresEvidenceAndExactCatalogEvent(){
  assertThatCode(()->SupportRules.create(organizer(event,null,List.of("https://example.com/official")))).doesNotThrowAnyException();
  for(Create invalid:List.of(organizer(event,null,List.of()),organizer(event,99L,List.of("https://example.com")),organizer(new Target("PLATFORM","EVENT",10,10L,null,null,null,null),null,List.of("https://example.com")),organizer(new Target("CATALOG","EVENT",10,11L,null,null,null,null),null,List.of("https://example.com")),organizer(new Target("CATALOG","PARTICIPANT",10,10L,null,null,null,null),null,List.of("https://example.com"))))
   assertThatThrownBy(()->SupportRules.create(invalid)).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void ownersCannotChangeIdentityMembershipLocationOrPublishFlags(){
  for(String key:List.of("organizer","edition","name","reviewState","seriesId","banners","discoveryLinks"))assertThatThrownBy(()->OwnershipCatalogService.validateFields("EVENT",Map.of(key,"x"))).isInstanceOf(ApiException.class);
  for(String key:List.of("members","locations","registrationName","products"))assertThatThrownBy(()->OwnershipCatalogService.validateFields("PARTICIPANT",Map.of(key,"x"))).isInstanceOf(ApiException.class);
  assertThatCode(()->OwnershipCatalogService.validateFields("EVENT",Map.of("description","확인된 설명","admission","무료"))).doesNotThrowAnyException();
  assertThatThrownBy(()->OwnershipCatalogService.validateFields("EVENT",Map.of())).isInstanceOf(ApiException.class);
 }
 @Test void selfApprovalNeverWritesOrganizerGrant(){
  var support=mock(SupportService.class);UUID id=UUID.randomUUID();
  when(support.row(id,true)).thenReturn(new HashMap<>(Map.of("kind","CLAIM","category","ORGANIZER","status","OPEN","requester_id",1L)));
  var service=new ExhibitorClaimsService(support);
  assertThatThrownBy(()->service.decide(id,new ClaimDecision(0,"APPROVE","근거 확인","승인",null,"단체","https://example.com"),new Principal(1L,true,false))).isInstanceOf(ApiException.class).hasMessageContaining("본인 신청");
  verify(support,never()).database();
 }
 @Test void nonAdminCannotLinkSeriesOrRevoke(){
  var support=mock(SupportService.class);var service=new OwnershipCatalogService(support,mock(CatalogService.class));var user=new Principal(1L,false,false);
  assertThatThrownBy(()->service.linkSeries(10,null,user)).isInstanceOf(ApiException.class);
  assertThatThrownBy(()->service.revokeEvent(10,2,new Revoke(0,"이유"),user)).isInstanceOf(ApiException.class);
  verifyNoInteractions(support);
 }
 @Test void missingOrRevokedGrantBlocksEditingBeforeAnyMutation(){
  var support=mock(SupportService.class);var db=mock(JdbcTemplate.class);var catalog=mock(CatalogService.class);
  when(support.database()).thenReturn(db);
  when(db.queryForList("select id from subculture_event_candidate where id=? and review_state<>'EXCLUDED' for update",10L)).thenReturn(List.of(Map.of("id",10L)));
  var service=new OwnershipCatalogService(support,catalog);
  assertThatThrownBy(()->service.edit("EVENT",10,0,new OwnershipCatalogService.OwnerEdit(1,Map.of("description","설명"),"사유"),1)).isInstanceOf(ApiException.class);
  verifyNoInteractions(catalog);
  verify(db,never()).update(anyString(),any(Object[].class));
 }
 @Test void jointBoothDoesNotGrantWholeBoothEditing(){
  var support=mock(SupportService.class);var db=mock(JdbcTemplate.class);when(support.database()).thenReturn(db);
  when(db.queryForList("select exhibitor_id from subculture_participant_member where participant_id=?",20L)).thenReturn(List.of(Map.of("exhibitor_id",1L),Map.of("exhibitor_id",2L)));
  assertThatThrownBy(()->new OwnershipCatalogService(support,mock(CatalogService.class)).products(10,20,1)).isInstanceOf(ApiException.class).hasMessageContaining("공동 부스");
 }
}
