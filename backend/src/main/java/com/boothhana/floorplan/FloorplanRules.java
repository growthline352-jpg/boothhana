package com.boothhana.floorplan;
import java.text.Normalizer;
import java.time.*;
import java.util.*;
import static com.boothhana.floorplan.FloorplanModels.*;
/** Pure rules: no LLM assertions grant permissions or publication. Normalized coordinates use ORIGINAL pixels. */
public final class FloorplanRules {
 private FloorplanRules() {}
 public static String key(String s) { return s==null?"":Normalizer.normalize(s,Normalizer.Form.NFKC).strip().toUpperCase(Locale.ROOT)
   .replaceAll("[\\s\\u00a0]+","").replace('\u2010','-').replace('\u2011','-').replace('\u2013','-'); }
 /** Escape structural delimiters AFTER normalization. Ordinary historic keys stay byte-identical.
  * Percent must be escaped first so literal %7C cannot alias an escaped pipe. */
 public static String scopeIdentity(long asset,PlanScope s) {
  scope(s);
  String hall=key(s.hall()),zone=key(s.zone());
  String value=scopePart(hall)+"|"+scopePart(zone)+"|"+String.join(",",new TreeSet<>(s.dates()));
  return s.dates().isEmpty()||hall.isBlank()?value+"|asset:"+asset:value;
 }
 private static String scopePart(String value){return value.replace("%","%25").replace("|","%7C");}
 public static void text(String s,int max,boolean required) {if(s==null?required:s.length()>max||required&&s.isBlank())throw new IllegalArgumentException("문자열 범위 오류");}
 public static void scope(PlanScope s) {
  if(s==null||s.dates()==null||s.dates().size()>90)throw new IllegalArgumentException("배치도 범위 오류");
  text(s.hall(),200,false);text(s.zone(),200,false);text(s.title(),300,true);
  Set<String> seen=new HashSet<>();for(String day:s.dates()) {text(day,10,true);LocalDate.parse(day);if(!seen.add(day))throw new IllegalArgumentException("중복 적용일");}
 }
 public static void geometry(Geometry g) {
  if(g==null||g.shapes()==null||g.shapes().size()>3000||g.warnings()==null||g.warnings().size()>200)throw new IllegalArgumentException("배치도 도형 한도 오류");
  text(g.extractorVersion(),80,true);for(String s:g.warnings())text(s,1000,true);
  Set<String> ids=new HashSet<>();
  for(Shape s:g.shapes()) {
   if(s==null)throw new IllegalArgumentException("빈 도형");text(s.id(),80,true);text(s.label(),80,false);
   if(!s.id().matches("[A-Za-z0-9_-]+")||!ids.add(s.id())||(s.recognition()==null||!Set.of("READABLE","UNCERTAIN").contains(s.recognition()))||s.points()==null||s.points().size()<3||s.points().size()>16)throw new IllegalArgumentException("도형 ID/판독 상태 오류");
   Set<Point> ps=new HashSet<>();for(Point p:s.points())if(p==null||!Double.isFinite(p.x())||!Double.isFinite(p.y())||p.x()<0||p.x()>1||p.y()<0||p.y()>1||!ps.add(p))throw new IllegalArgumentException("원본 범위 밖/중복 좌표");
   if(area(s.points())<0.0000005)throw new IllegalArgumentException("면적이 없는 도형");
   int n=s.points().size();for(int i=0;i<n;i++)for(int j=i+1;j<n;j++)if((i+1)%n!=j&&(j+1)%n!=i&&intersects(s.points().get(i),s.points().get((i+1)%n),s.points().get(j),s.points().get((j+1)%n)))throw new IllegalArgumentException("자기 교차 도형");
  }
 }
 public static double area(List<Point> ps) {double a=0;for(int i=0;i<ps.size();i++){Point p=ps.get(i),q=ps.get((i+1)%ps.size());a+=p.x()*q.y()-q.x()*p.y();}return Math.abs(a)/2;}
 private static double cross(Point a,Point b,Point c){return (b.x()-a.x())*(c.y()-a.y())-(b.y()-a.y())*(c.x()-a.x());}
 private static boolean intersects(Point a,Point b,Point c,Point d){double x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);return x*y<=0&&u*v<=0&&Math.max(Math.min(a.x(),b.x()),Math.min(c.x(),d.x()))<=Math.min(Math.max(a.x(),b.x()),Math.max(c.x(),d.x()))&&Math.max(Math.min(a.y(),b.y()),Math.min(c.y(),d.y()))<=Math.min(Math.max(a.y(),b.y()),Math.max(c.y(),d.y()));}
 private static double overlap(Shape a,Shape b){double[] x=box(a),y=box(b);double w=Math.max(0,Math.min(x[2],y[2])-Math.max(x[0],y[0])),h=Math.max(0,Math.min(x[3],y[3])-Math.max(x[1],y[1]));return w*h/Math.max(1e-12,Math.min((x[2]-x[0])*(x[3]-x[1]),(y[2]-y[0])*(y[3]-y[1])));}
 private static double[] box(Shape s){double x=1,y=1,r=0,b=0;for(Point p:s.points()){x=Math.min(x,p.x());y=Math.min(y,p.y());r=Math.max(r,p.x());b=Math.max(b,p.y());}return new double[]{x,y,r,b};}
 public static Mapping map(Geometry geometry,PlanScope scope,List<Roster> roster,Map<String,ManualLink> manual) {
  geometry(geometry);scope(scope);Set<Long> allowed=new HashSet<>();roster.forEach(r->allowed.add(r.id()));
  Set<String> shapeIds=new HashSet<>();geometry.shapes().forEach(s->shapeIds.add(s.id()));
  for(var e:manual.entrySet()) {
   ManualLink m=e.getValue();if(!shapeIds.contains(e.getKey())||m==null||!allowed.contains(m.participantId())||m.dates()==null||m.dates().size()>90)throw new IllegalArgumentException("다른 행사/없는 부스 수동 연결");
   text(m.reason(),1000,true);for(String d:m.dates()){text(d,10,true);LocalDate.parse(d);if(!scope.dates().isEmpty()&&!scope.dates().contains(d))throw new IllegalArgumentException("도면 범위 밖 날짜");}
   if(!scope.dates().isEmpty()&&m.dates().isEmpty())throw new IllegalArgumentException("수동 연결 적용일 필요");
  }
  List<MappedShape> out=new ArrayList<>();int matched=0;
  Map<String,Long> codes=new HashMap<>();for(Shape s:geometry.shapes())if(!key(s.label()).isEmpty())codes.merge(key(s.label()),1L,Long::sum);
  for(Shape s:geometry.shapes()) {
   List<String> issues=new ArrayList<>();List<Link> links=new ArrayList<>();Set<Long> candidates=new LinkedHashSet<>();
   if(!s.boundaryConfirmed()||!"READABLE".equals(s.recognition())||key(s.label()).isBlank())issues.add("판독/영역 확인 필요");
   if(codes.getOrDefault(key(s.label()),0L)>1)issues.add("같은 도면에 중복 부스번호");
   if(geometry.shapes().stream().anyMatch(b->b!=s&&overlap(s,b)>0.35))issues.add("다른 부스 영역과 겹침 — 위치 확인 필요");
   Map<Long,Set<String>> found=new LinkedHashMap<>();
   for(Roster r:roster)for(Place loc:r.locations())if(!key(s.label()).isBlank()&&key(s.label()).equals(key(loc.code()))) {
    candidates.add(r.id());
    // Missing one hall/zone is not evidence of an equal hall. Never erase half-booth suffixes.
    if(!key(scope.hall()).equals(key(loc.hall()))||!key(scope.zone()).equals(key(loc.zone())))continue;
    if(scope.dates().isEmpty()!=loc.dates().isEmpty())continue;
    Set<String> dates=new TreeSet<>(scope.dates());dates.retainAll(loc.dates());
    if(!scope.dates().isEmpty()&&dates.isEmpty())continue;
    found.computeIfAbsent(r.id(),k->new TreeSet<>()).addAll(dates);
   }
   Set<String> covered=new HashSet<>();boolean ambiguous=false;
   for(var item:found.entrySet()) {
    if(item.getValue().isEmpty()&&found.size()>1)ambiguous=true;
    for(String d:item.getValue())if(!covered.add(d))ambiguous=true;
   }
   if(ambiguous)issues.add("동일 날짜/전시관에 참가자가 중복됨");
   ManualLink m=manual.get(s.id());
   if(m!=null)links.add(new Link(m.participantId(),m.dates(),"MANUAL"));
   else if(issues.isEmpty())for(var item:found.entrySet())links.add(new Link(item.getKey(),List.copyOf(item.getValue()),"EXACT"));
   if(links.isEmpty()&&issues.isEmpty())issues.add("명단·날짜·전시관 일치 근거 미확보");
   boolean resolved=!links.isEmpty()&&(m!=null||issues.isEmpty());if(resolved)matched++;
   out.add(new MappedShape(s,resolved?m!=null?"MANUAL":"MATCHED":candidates.size()>1?"AMBIGUOUS":"UNMAPPED",links,List.copyOf(candidates),issues));
  }
  return new Mapping(out,matched,out.size()-matched,geometry.complete()?List.of():List.of("일부 영역만 추출됨; 전체 배치도 확인 필요"));
 }
 public static Instant nextCheck(LocalDate today,LocalDate start,LocalDate end,String status,LocalDate announced,Instant now) {
  if(end.isBefore(today))return end.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
  Instant normal=now.plusSeconds(start.isAfter(today.plusDays(14))?7*86400:86400);
  if("ERROR".equals(status))return now.plusSeconds(6*3600);
  if(announced!=null&&announced.isAfter(today))return normal.isBefore(announced.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant())?normal:announced.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant();
  return normal;
 }
}
