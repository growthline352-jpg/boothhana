import com.boothhana.goods.GoodsShowcaseService;
import com.boothhana.health.ReadinessService;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;

public class ServiceTest {
    static int checks;
    static void check(boolean value){checks++;if(!value)throw new AssertionError("service "+checks);}
    static class DB extends JdbcTemplate {
        List<Map<String,Object>> rows=List.of();String query;Object[] args;boolean fail;int writes;
        @Override public List<Map<String,Object>> queryForList(String sql,Object...args){this.query=sql;this.args=args;if(fail)throw new IllegalStateException("password=TOPSECRET");
            if(sql.contains("information_schema.columns"))return com.boothhana.health.SchemaContract.COLUMNS.entrySet().stream().map(e->{
                String[] key=e.getKey().split("\\.",2);Map<String,Object> r=new HashMap<>();r.put("table_name",key[0]);r.put("column_name",key[1]);r.put("udt_name",e.getValue().udt());r.put("character_maximum_length",e.getValue().length());r.put("is_nullable",e.getValue().notNull()?"NO":"YES");return r;
            }).toList();return rows;}
        @Override public int update(String sql,Object...args){writes++;return 1;}
    }
    public static void main(String[] a){
        DB db=new DB();var service=new GoodsShowcaseService(db,"https://images.example.com");
        Map<String,Object> row=new HashMap<>(Map.of("product_id",1L,"event_product_id",11L,"name","굿즈","price",9000L,"booth_name","부스","event_name","행사","event_status","PUBLISHED","is_sold_out",false,"stock_mode","FINITE","stock_quantity",5));
        row.put("image_key","verified/product/1/test.png");row.put("units",999L);db.rows=List.of(row);
        var feed=service.feed("SUBCULTURE");
        check(feed.items().size()==1);check(feed.items().getFirst().rank()==1);check(feed.items().getFirst().imageUrl().equals("https://images.example.com/verified/product/1/test.png"));
        check(feed.windowDays()==30);check(!feed.items().getFirst().soldOut());check(db.args[2].equals("SUBCULTURE"));
        check(Arrays.stream(GoodsShowcaseService.Item.class.getRecordComponents()).noneMatch(c->List.of("units","saleNo","userId","paymentMethod").contains(c.getName())));
        row.put("image_key","https://external.example.com/no-permission.png");row.put("stock_quantity",0);
        check(service.feed("SUBCULTURE").items().getFirst().imageUrl()==null);check(service.feed("SUBCULTURE").items().getFirst().soldOut());
        db.rows=List.of();check(service.feed("SUBCULTURE").items().isEmpty());
        boolean rejected=false;try{service.setting(1,new GoodsShowcaseService.SettingInput("SUBCULTURE",true,0L));}catch(RuntimeException ex){rejected=true;}check(rejected);check(db.writes==0);
        db.fail=true;var report=new ReadinessService(db).check();check(!report.ready());check(report.issues().contains("SCHEMA_OR_DATABASE_UNAVAILABLE"));check(report.diagnosticId()!=null);
        check(!report.toString().contains("TOPSECRET"));
        db.fail=false;db.rows=List.of(Map.of("relname","product","relrowsecurity",false,"server_grants",true,"server_policy",true,"api_grants",false));
        report=new ReadinessService(db).check();check(!report.ready());check(report.issues().contains("RLS_DISABLED:product"));
        db.rows=List.of(Map.of("relname","goods_showcase","relrowsecurity",true,"server_grants",true,"server_policy",true,"api_grants",true));
        report=new ReadinessService(db).check();check(report.issues().contains("DATA_API_GRANT_PRESENT:goods_showcase"));
        db.rows=com.boothhana.health.SchemaContract.TABLES.keySet().stream().map(t->Map.<String,Object>of("relname",t,"relrowsecurity",true,"server_grants",true,"server_policy",true,"api_grants",false)).toList();
        var readyService=new ReadinessService(db);var ready=readyService.check();check(ready.ready());check(ready.issues().isEmpty());
        db.fail=true;check(readyService.check()==ready); // Cached for five seconds, no network claims.
        System.out.println("PASS: v11 "+checks+" real service checks with FAKE JDBC; SQL not executed.");
    }
}
