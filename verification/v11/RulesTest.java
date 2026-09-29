import com.boothhana.collection.CollectionModels.*;
import com.boothhana.collection.PublicEventProjection;
import com.boothhana.goods.GoodsRankingQuery;
import com.boothhana.api.FailureDiagnostics;
import com.boothhana.health.SchemaContract;
import java.time.*;
import java.util.*;

public class RulesTest {
    static int tests;
    static void check(boolean value){tests++;if(!value)throw new AssertionError("condition "+tests);}
    public static void main(String[] args)throws Exception {
        for(String state:List.of("CANCELED","POSTPONED","RESCHEDULED","SCHEDULED","UNKNOWN")) {
            EventData raw=new EventData("테스트", "DOLL", "주최", "1", "SEOUL", "장소", null,"설명","입장",List.of("주제"),
                List.of(new Occurrence("2026-10-10","2026-10-10",null,null)),
                List.of(new Source("https://example.com/status","OFFICIAL","ORIGINAL","test")),
                List.of(new Banner("https://example.com/unapproved.png","https://example.com/","UNKNOWN",null,true)),List.of("주의"),
                "MULTI_BOOTH",List.of(),new OperationStatus(state,"공식 안내","https://example.com/status","2026-09-17"));
            EventData safe=PublicEventProjection.fromReviewed(raw);
            // Inspect every record component so a future DTO field cannot disappear unnoticed.
            for(var field:EventData.class.getRecordComponents()) {
                if(field.getName().equals("banners"))check(safe.banners().isEmpty());
                else check(Objects.equals(field.getAccessor().invoke(raw),field.getAccessor().invoke(safe)));
            }
            check(raw.banners().size()==1);
        }
        Instant now=Instant.parse("2026-10-01T00:00:00Z");
        check(Duration.between(GoodsRankingQuery.start(now),now).equals(Duration.ofDays(30)));
        check(GoodsRankingQuery.MAX_ITEMS==12);
        check(GoodsRankingQuery.category("SUBCULTURE").equals("SUBCULTURE"));
        for(String bad:new String[]{"", "subculture", "';drop table product",null}){
            boolean rejected=false;try{GoodsRankingQuery.category(bad);}catch(IllegalArgumentException e){rejected=true;}check(rejected);
        }
        String sql=GoodsRankingQuery.PUBLIC_SQL;
        for(String clause:List.of("s.status='SOLD'","s.sold_at>=?","s.sold_at<?","sum(i.quantity)","g.enabled","g.category=?","limit 12","t.units desc","d.product_id asc","s.sale_no not like 'MOCK-%'"))check(sql.contains(clause));
        check(!sql.contains("reservation"));check(!sql.contains("subculture_catalog_product"));
        var root=new IllegalArgumentException("DB_PASSWORD=super-secret");
        root.setStackTrace(new StackTraceElement[]{new StackTraceElement("com.boothhana.goods.Svc","load","Svc.java",42)});
        var wrapper=new IllegalStateException("https://host?token=secret",root);
        String diag=FailureDiagnostics.summary(wrapper);
        check(!diag.contains("secret"));check(!diag.contains("token"));check(diag.contains("IllegalArgumentException"));check(diag.contains("Svc.load:42"));
        root.initCause(wrapper);check(FailureDiagnostics.summary(wrapper).length()<2000);
        check(SchemaContract.TABLES.size()==44);
        check(SchemaContract.TABLES.get("product").contains("version"));
        check(SchemaContract.TABLES.get("support_ticket").contains("guest_secret_hash"));
        check(SchemaContract.TABLES.get("event_booth").contains("version"));
        check(SchemaContract.TABLES.get("event_product").contains("version"));
        check(SchemaContract.TABLES.get("goods_showcase").contains("category"));
        check(SchemaContract.TABLES.get("subculture_floorplan_version").contains("geometry_json"));
        check(SchemaContract.probeSql().split("limit 0",-1).length==SchemaContract.TABLES.size()+1);
        check(!SchemaContract.probeSql().contains("delete"));
        System.out.println("PASS: v11 "+tests+" pure Java assertions (no DB/framework).");
    }
}
