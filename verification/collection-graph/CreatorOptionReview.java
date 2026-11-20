import java.sql.*;
import java.util.*;
import com.boothhana.collection.*;
import com.boothhana.collection.graph.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import static com.boothhana.collection.CollectionModels.*;
import static com.boothhana.collection.CatalogModels.*;
class CreatorOptionReview {
 @SuppressWarnings("unchecked") static Map<String,Object> map(JsonMapper json,Object value){return json.readValue(json.writeValueAsString(value),Map.class);}
 public static void main(String[] args) throws Exception {
  String url="jdbc:postgresql://127.0.0.1:55439/boothhana_release_test";
  try(Connection conn=DriverManager.getConnection(url,"boothhana_release_runtime","isolated-interest-test")){
   conn.setAutoCommit(false);
   try {
    JdbcTemplate db=new JdbcTemplate(new SingleConnectionDataSource(conn,true));
    if(!"boothhana_release_test".equals(db.queryForObject("select current_database()",String.class)))throw new IllegalStateException("Wrong database");
    JsonMapper json=JsonMapper.builder().build();String marker=UUID.randomUUID().toString(),source="https://example.com/review-order";
    UUID job=UUID.randomUUID(),extraction=UUID.randomUUID(),verdict=UUID.randomUUID();
    db.update("insert into collection_job(id,kind,target_id,input_json,dedupe_key) values(?,'CREATOR','1','{}',?)",job,marker);
    db.update("insert into collection_extraction(id,job_id,context_hash,result_hash,result_json,context_json,audit_json) values(?,?,?,?,'{}','{}','{}')",extraction,job,"a".repeat(64),"b".repeat(64));
    db.update("insert into collection_verdict(id,extraction_id,verdict,reason,audit_json) values(?,?,'APPROVE','rollback-only review','{}')",verdict,extraction);
    Member member=new Member("[REVIEW] Options Author "+marker,"ARTIST",List.of(),source);
    long creator=db.queryForObject("insert into subculture_exhibitor(identity_key,name,profile_json) values(?,?,cast(? as jsonb)) returning id",Long.class,marker,member.name(),json.writeValueAsString(member));
    var sources=List.of(new Source(source,"OFFICIAL","ORIGINAL","Two independent sale options"));
    ProductData a=new ProductData("","Hero A keyring","Keyring A",member.name(),List.of(),List.of(),"GENERAL_CATALOG",null,"UNKNOWN",null,sources,List.of(),List.of());
    ProductData b=new ProductData("","Hero B keyring","Keyring B",member.name(),List.of(),List.of(),"GENERAL_CATALOG",null,"UNKNOWN",null,sources,List.of(),List.of());
    CatalogRules.product(a);CatalogRules.product(b);
    var result=new LinkedHashMap<String,Object>();result.put("profile",map(json,member));result.put("sources",sources);result.put("goods",List.of(map(json,a),map(json,b)));result.put("coverage","COMPLETE");result.put("productCoverage",List.of(Map.of("sourceUrl",source,"optionNames",List.of(a.name(),b.name()),"complete",true)));
    var projection=new GraphProjection(db,json,null,null,null,new GraphImages(db,json),new GraphIdentity(db,json));
    var receipt=projection.apply("CREATOR",Long.toString(creator),Map.of(),Map.of("creator",Map.of("data",map(json,member))),result,verdict,true,s->{});
    int stored=db.queryForObject("select count(*) from collection_product where exhibitor_id=?",Integer.class,creator);
    System.out.println(json.writeValueAsString(Map.of("reportedProducts",receipt.get("products"),"storedProducts",stored,"storedNames",db.queryForList("select data_json->>'name' from collection_product where exhibitor_id=?",String.class,creator),"rollback",true)));
    if(stored!=1||!Integer.valueOf(2).equals(receipt.get("products")))throw new IllegalStateException("Reproduction changed");
   } finally {conn.rollback();}
  }
 }
}
