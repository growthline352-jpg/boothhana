package com.boothhana.interests;
import com.boothhana.api.ApiException;
import java.net.URI;
import java.text.Normalizer;
import java.util.*;
import static com.boothhana.interests.InterestModels.*;
public final class InterestRules {
 private InterestRules() {}
 public static final Set<String> MEDIA=Set.of("게임","애니메이션","만화·웹툰","소설","오리지널·기타");
 public static String text(String value,int max,boolean required){String s=value==null?"":value.strip();if(s.length()>max||required&&s.isEmpty()||s.chars().anyMatch(c->Character.isISOControl(c)))throw ApiException.badRequest("입력 길이와 내용을 확인해 주세요.");return s;}
 public static String normalized(String s){return Normalizer.normalize(s,Normalizer.Form.NFKC).replaceAll("\\s+", "").toLowerCase(Locale.ROOT);}
 public static String url(String raw){String s=text(raw,2048,true);try{URI u=URI.create(s);if(!Set.of("http","https").contains(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null)throw new IllegalArgumentException();}catch(IllegalArgumentException e){throw ApiException.badRequest("공식 근거 URL을 입력해 주세요.");}return s;}
 public static Entry entry(Entry e){if(e==null||e.id()==null)throw ApiException.badRequest("관심 ID가 필요합니다.");String name=text(e.customName(),160,false),work=text(e.customWork(),160,false),medium=text(e.medium(),24,false);
  int modes=(e.subjectId()!=null?1:0)+(e.exhibitorId()!=null?1:0)+(!name.isEmpty()?1:0);
  if(modes!=1||e.exhibitorId()!=null&&e.exhibitorId()<1)throw ApiException.badRequest("관심 대상을 하나만 선택해 주세요.");
  if(!name.isEmpty()&&(work.isEmpty()||!MEDIA.contains(medium)))throw ApiException.badRequest("직접 입력한 캐릭터의 작품 이름과 종류가 필요합니다.");
  if(name.isEmpty()&&(!work.isEmpty()||!medium.isEmpty()||e.customWorkId()!=null))throw ApiException.badRequest("목록의 항목과 직접 입력을 함께 저장할 수 없습니다.");
  return new Entry(e.id(),e.subjectId(),e.exhibitorId(),name,work,medium,e.customWorkId());
 }
 public static String key(Entry e){return e.subjectId()!=null?"subject:"+e.subjectId():e.exhibitorId()!=null?"creator:"+e.exhibitorId():"custom:"+normalized(e.customName())+"\u001f"+(e.customWorkId()!=null?e.customWorkId().toString():normalized(e.customWork()))+"\u001f"+e.medium();}
 public static List<Entry> entries(Settings input){if(input==null||input.revision()<0||input.entries()==null||input.entries().size()>100)throw ApiException.badRequest("관심은 최대 100개까지 저장할 수 있습니다.");List<Entry> rows=input.entries().stream().map(InterestRules::entry).toList();if(rows.stream().map(Entry::id).distinct().count()!=rows.size()||rows.stream().map(InterestRules::key).distinct().count()!=rows.size())throw ApiException.badRequest("중복된 관심 항목이 있습니다.");return rows;}
}
