package com.boothhana.service;

import com.boothhana.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;

/** Serializes direct registration and collected-booth claims for the same account. */
public final class CreatorBoothLimits {
 private CreatorBoothLimits() {}
 public static void lock(JdbcTemplate db,long user) {
  // Group changes and publication use this lock first as well.
  db.queryForList("select pg_advisory_xact_lock(hashtext('boothhana_operating_groups'))");
  db.queryForList("select id from app_user where id=? for update",user);
 }
 public static long scope(JdbcTemplate db,long event) {
  return db.queryForObject("select coalesce((select root_event_id from catalog_operating_group_member where event_id=?),?)",Long.class,event,event);
 }
 public static Set<Long> owned(JdbcTemplate db,long user,long event) {
  return new HashSet<>(db.queryForList("""
   select distinct p.id from subculture_participant p
   left join catalog_operating_group_member g on g.event_id=p.event_id
   where coalesce(g.root_event_id,p.event_id)=? and (
    exists(select 1 from catalog_creator_booth c where c.participant_id=p.id and c.user_id=?)
    or exists(select 1 from subculture_participant_member pm join exhibitor_manager m on m.exhibitor_id=pm.exhibitor_id
      where pm.participant_id=p.id and m.user_id=? and m.state='ACTIVE'))
   """,Long.class,scope(db,event),user,user));
 }
 public static void available(JdbcTemplate db,long user,long event,Long sameParticipant) {
  Set<Long> ids=owned(db,user,event);if(sameParticipant!=null)ids.remove(sameParticipant);
  if(!ids.isEmpty())throw ApiException.conflict("한 행사에는 계정당 부스 1개만 등록하거나 연결할 수 있습니다. 기존 내 부스를 관리해 주세요.");
 }
 /** An exhibitor grant covers its collected appearances, so check every affected event. */
 public static void claim(JdbcTemplate db,long user,long exhibitor) {
  lock(db,user);
  Map<Long,Set<Long>> scopes=new HashMap<>();
  for(var p:db.queryForList("select p.id,p.event_id from subculture_participant_member m join subculture_participant p on p.id=m.participant_id where m.exhibitor_id=?",exhibitor)) {
   long event=((Number)p.get("event_id")).longValue(),id=((Number)p.get("id")).longValue();
   available(db,user,event,id);
   scopes.computeIfAbsent(scope(db,event),k->new HashSet<>()).add(id);
  }
  if(scopes.values().stream().anyMatch(ids->ids.size()>1))throw ApiException.conflict("같은 행사에 여러 부스가 연결된 업체입니다. 행사별 부스 연결을 정리한 뒤 운영자 확인을 처리해 주세요.");
 }
}
