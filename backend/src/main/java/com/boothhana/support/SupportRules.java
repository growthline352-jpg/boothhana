package com.boothhana.support;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.*;
import java.util.*;
import static com.boothhana.support.SupportModels.*;

/** Pure rules: no network, DB or logging of request content. */
public final class SupportRules {
 private SupportRules() {}
 public static final Set<String> REPORT_REASONS=Set.of("SCHEDULE_PLACE","PARTICIPATION_LOCATION","PRODUCT_PRICE","IMAGE_RIGHTS","OTHER");
 public static final Set<String> INQUIRY_REASONS=Set.of("ACCOUNT","SERVICE","RESERVATION","BUSINESS","EVENT_REQUEST","FEATURE_REQUEST","OTHER");
 /** Anonymous improvement intake has no linked target, attachments or reply credentials in its response. */
 public static void feedback(GuestCreate g) {
  if(g==null||g.ticket()==null)throw new IllegalArgumentException("개선 의견을 입력해 주세요.");
  Create c=g.ticket();create(c);guestHash(g.accessKey());
  if(g.website()!=null&&!g.website().isBlank())throw new IllegalArgumentException("접수할 수 없습니다.");
  if(!"INQUIRY".equals(c.kind())||!"FEATURE_REQUEST".equals(c.category())||c.target()!=null||c.exhibitorId()!=null||c.evidence()!=null&&!c.evidence().isEmpty())throw new IllegalArgumentException("개선 의견 접수 형식을 확인해 주세요.");
  if(c.context()!=null)for(var entry:c.context().entrySet()) {
   String path=entry.getValue();
   if(!"pagePath".equals(entry.getKey())||path==null||!path.startsWith("/")||path.startsWith("//")||path.contains("?")||path.contains("#")||path.contains("\\")||path.codePoints().anyMatch(Character::isISOControl))throw new IllegalArgumentException("접수 화면 경로를 확인해 주세요.");
  }
 }
 public static String text(String value,int max,boolean required) {
  String s=value==null?"":value.strip();
  if((required&&s.isEmpty())||s.length()>max||s.codePoints().anyMatch(c->c==0))throw new IllegalArgumentException("입력 길이와 필수 항목을 확인해 주세요.");
  return s;
 }
 public static void evidence(List<String> urls) {
  if(urls==null)return;if(urls.size()>5)throw new IllegalArgumentException("근거 링크는 최대 5개입니다.");
  for(String s:urls){text(s,2048,true);try{URI u=URI.create(s);if(!Set.of("https","http").contains(u.getScheme())||u.getHost()==null||u.getRawUserInfo()!=null||s.contains("\\"))throw new IllegalArgumentException();}catch(RuntimeException e){throw new IllegalArgumentException("근거 링크는 올바른 HTTP(S) 주소여야 합니다.");}}
 }
 public static void create(Create c) {
  if(c==null||c.requestId()==null||c.kind()==null||!Set.of("REPORT","INQUIRY","CLAIM").contains(c.kind()))throw new IllegalArgumentException("접수 형식을 확인해 주세요.");
  text(c.title(),160,true);text(c.body(),10000,true);evidence(c.evidence());
  Set<String> reasons="REPORT".equals(c.kind())?REPORT_REASONS:"CLAIM".equals(c.kind())?Set.of("OWNERSHIP","ORGANIZER"):INQUIRY_REASONS;
  if(c.category()==null||!reasons.contains(c.category()))throw new IllegalArgumentException("접수 분류를 확인해 주세요.");
  if(!"INQUIRY".equals(c.kind())&&c.target()==null)throw new IllegalArgumentException("신고·관리권 신청 대상을 선택해 주세요.");
  if("CLAIM".equals(c.kind())) {
   if(c.evidence()==null||c.evidence().isEmpty())throw new IllegalArgumentException("공식 운영 근거 링크를 입력해 주세요.");
   if("ORGANIZER".equals(c.category())) {
    if(c.exhibitorId()!=null||!"CATALOG".equals(c.target().namespace())||!"EVENT".equals(c.target().type())||c.target().eventId()<1||!Objects.equals(c.target().id(),c.target().eventId()))throw new IllegalArgumentException("주최자 신청은 해당 행사만 선택해 주세요.");
   } else if(c.exhibitorId()==null||c.exhibitorId()<1)throw new IllegalArgumentException("업체를 선택해 주세요.");
  }
  if(!"CLAIM".equals(c.kind())&&c.exhibitorId()!=null)throw new IllegalArgumentException("잘못된 업체 연결입니다.");
  if(c.context()!=null){if(c.context().size()>5)throw new IllegalArgumentException("화면 문맥이 너무 큽니다.");for(var e:c.context().entrySet()){if(e.getKey()==null||!Set.of("pagePath","viewedVersion","viewedLabel","viewedAt","errorCode").contains(e.getKey()))throw new IllegalArgumentException("허용하지 않는 문맥입니다.");text(e.getValue(),1000,false);}}
 }
 public static void message(Message m,boolean admin) {
  if(m==null||m.requestId()==null||m.revision()<0||(!admin&&m.internal()))throw new IllegalArgumentException("답변 형식이 올바르지 않습니다.");
  text(m.body(),10000,true);evidence(m.evidence());
 }
 public static String digest(String value) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 public static boolean constantEquals(String a,String b){return a!=null&&b!=null&&MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII),b.getBytes(StandardCharsets.US_ASCII));}
 public static String guestHash(String token) { if(token==null||!token.matches("[A-Za-z0-9_-]{43}"))throw new IllegalArgumentException("비회원 조회키를 확인해 주세요.");return digest(token); }
 public static boolean canRead(Long requester,Principal p){return p!=null&&(p.admin()||p.guest()&&requester==null||p.userId()!=null&&p.userId().equals(requester));}
 public static String transitioned(String kind,String current,String action) {
  if(kind==null||current==null||action==null)throw new IllegalArgumentException("처리 상태를 확인해 주세요.");
  if("CLAIM".equals(kind)&&"REOPEN".equals(action))throw new IllegalArgumentException("결정된 관리권 신청은 새로 접수해 주세요.");
  return switch(action){
   case "ASSIGN_SELF"->current;
   case "START"->{if(!Set.of("OPEN","WAITING_USER","ANSWERED","IN_PROGRESS").contains(current))throw new IllegalArgumentException("종료한 접수는 먼저 다시 열어 주세요.");yield "IN_PROGRESS";}
   case "WAIT"->{if(Set.of("CLOSED","RESOLVED").contains(current))throw new IllegalArgumentException("종료한 접수입니다.");yield "WAITING_USER";}
   case "REOPEN"->{if(!Set.of("CLOSED","RESOLVED","ANSWERED").contains(current))throw new IllegalArgumentException("다시 열 수 있는 상태가 아닙니다.");yield "OPEN";}
   case "CLOSE"->{if(!"INQUIRY".equals(kind)||!"ANSWERED".equals(current))throw new IllegalArgumentException("문의 답변 후 종료할 수 있습니다.");yield "CLOSED";}
   case "NO_CHANGE","DUPLICATE","OTHER","VERIFY_CHANGED","HIDE","CORRECT"->{if(!"REPORT".equals(kind)||Set.of("CLOSED","RESOLVED").contains(current))throw new IllegalArgumentException("진행 중인 신고만 처리할 수 있습니다.");yield "RESOLVED";}
   default->throw new IllegalArgumentException("지원하지 않는 처리입니다.");
  };
 }
}
