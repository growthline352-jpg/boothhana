import java.nio.file.*;
import java.util.*;
import com.boothhana.collection.*;
import com.boothhana.collection.graph.*;
import com.boothhana.interests.*;
import tools.jackson.databind.json.JsonMapper;
import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CatalogModels.*;
class SampleReview {
 static JsonMapper j = JsonMapper.builder().build();
 static Map m(Object x){ return (Map)x; }
 static <T>T as(Object x,Class<T> c){return j.readValue(j.writeValueAsString(x),c);}
 public static void main(String[] args)throws Exception{
  var root=Path.of(args[0]);
  for(String name:List.of("creator-susu-fixed-retry","sales-comic242-fixed","discovery-illustar14-api-fixed-with-dates","discovery-comic338-fixed-retry","character-miku-fixed","character-hina-fixed-retry")){
   var e=j.readValue(Files.readString(root.resolve(name).resolve("extraction.json")),Map.class);var r=m(e.get("result"));var d=j.readValue(Files.readString(root.resolve(name).resolve("decision.json")),Map.class);
   try{
    new GraphProjection(null,j,null,null,null,null,null).checkSources(r,(List<String>)m(d.get("audit")).get("openedUrls"));
    if(name.startsWith("creator")){for(Object p:(List)r.get("goods"))CatalogRules.product(as(p,ProductData.class));}
    if(name.startsWith("sales")){var s=as(r,StageResult.class);String id=UUID.randomUUID().toString(),t="2026-10-08T12:00:00Z";CatalogRules.stage(new StageBatch("4",id,id,"SALES",1L,1L,1L,t,t,true,s));CatalogRules.sales(s.sales());}
    if(name.startsWith("discovery")){var s=as(r,SearchResult.class);var scope=new Scope("SEOUL_GYEONGGI","Asia/Seoul","2026-10-01","2026-10-31");String id=UUID.randomUUID().toString(),t="2026-10-08T12:00:00Z";CollectionRules.batch(new Batch("1",id,t,t,"CLI",true,scope,s));for(var v:s.events()){var c=CollectionRules.event(v,scope);if(!c.accepted())throw new RuntimeException(c.errors().toString());}}
    if(name.startsWith("character"))for(Object a:(List)r.get("assignments")){for(String kind:List.of("work","character")){var s=m(m(a).get(kind));InterestRules.text((String)s.get("name"),160,true);InterestRules.url((String)s.get("sourceUrl"));InterestRules.text((String)s.get("medium"),24,false);if(kind.equals("work")&&!InterestRules.MEDIA.contains(s.get("medium")))throw new RuntimeException("medium invalid");}}
    System.out.println(name+" PURE_CONTRACT_PASS");
   }catch(Exception ex){System.out.println(name+" FAIL "+ex);}
  }
 }
}
