import com.boothhana.collection.*;
import com.boothhana.api.ApiException;
import com.boothhana.upload.VerifiedImageStorage;
import static com.boothhana.collection.CatalogModels.*;
import org.springframework.jdbc.core.*;
import java.util.*;
import java.sql.*;
import java.lang.reflect.*;

/** Executes the actual service validation/CAS code with a small JDBC fake, NOT SQL/transaction proof. */
public class BannerServiceSmokeTest {
    static int checks;
    static void ok(boolean value,String label){if(!value)throw new AssertionError(label);checks++;System.out.println("PASS "+label);}
    static void denied(Runnable action,String text){try{action.run();throw new AssertionError("expected rejection "+text);}catch(ApiException e){ok(e.getMessage().contains(text),"reject "+text);}}
    static class DB extends JdbcTemplate {
        BannerSelection selection=new BannerSelection(null,0);int writes=0;
        final Map<Long,Map<String,Object>> assets=new HashMap<>();boolean excluded=false;
        void add(long id,long event,String type,Long participant,String rights,String state,String key) {
            Map<String,Object> r=new HashMap<>();r.put("id",id);r.put("event_id",event);r.put("participant_id",participant);r.put("product_id",null);
            r.put("revision",3L);r.put("type",type);r.put("rights_state",rights);r.put("storage_state",state);r.put("object_key",key);
            for(String col:List.of("image_url","page_url","caption","reported_rights","rights_note","error","credit"))r.put(col,"test");assets.put(id,r);
        }
        public void execute(String sql){}
        public List<Map<String,Object>> queryForList(String sql,Object... args){return ((Number)args[0]).longValue()==1?List.of(Map.of("id",1L,"review_state",excluded?"EXCLUDED":"REVIEWED")):List.of();}
        public <T>List<T> query(String sql,RowMapper<T> mapper,Object... args) {
            try {
                if(sql.startsWith("select banner_asset_id")) {
                    if(selection.revision()==0)return List.of();Map<String,Object> r=new HashMap<>();r.put("banner_asset_id",selection.assetId());r.put("revision",selection.revision());
                    return List.of(mapper.mapRow(rs(r),0));
                }
                if(sql.startsWith("select * from subculture_catalog_asset where id=")){
                    var r=assets.get(((Number)args[0]).longValue());return r==null?List.of():List.of(mapper.mapRow(rs(r),0));
                }
                throw new AssertionError("unimplemented fake query: "+sql);
            }catch(SQLException e){throw new IllegalStateException(e);}
        }
        public int update(String sql,Object...args){
            if(sql.startsWith("update subculture_catalog_asset set rights_state=")){var r=assets.get(((Number)args[4]).longValue());if(r==null||((Number)r.get("revision")).longValue()!=((Number)args[5]).longValue())return 0;r.put("rights_state",args[0]);r.put("rights_note",args[1]);r.put("credit",args[2]);r.put("offline_allowed",args[3]);r.put("revision",((Number)r.get("revision")).longValue()+1);return 1;}
            if(!sql.startsWith("insert into subculture_catalog_presentation"))throw new AssertionError(sql);
            selection=new BannerSelection((Long)args[1],selection.revision()+1);writes++;return 1;}
        ResultSet rs(Map<String,Object> row){return (ResultSet)Proxy.newProxyInstance(getClass().getClassLoader(),new Class[]{ResultSet.class},(p,m,a)->switch(m.getName()){
            case "getBoolean" -> Boolean.TRUE.equals(row.get(a[0])); case "getLong" -> ((Number)row.get(a[0])).longValue(); case "getObject" -> row.get(a[0]);case "getString" -> (String)row.get(a[0]); default -> throw new UnsupportedOperationException(m.getName());});}
    }
    public static void main(String[] args){
        DB db=new DB();var store=new VerifiedImageStorage(){public void put(String k,String t,byte[]b,String h){throw new AssertionError("storage writes not needed");}public void verify(String k,String t,long s,String h){throw new AssertionError("storage not needed");}};
        var svc=new CatalogMediaService(db,store,"https://images.example.com");
        ok(svc.bannerSelection(1).revision()==0,"legacy selection missing maps to revision0 auto");
        db.add(10,1,"BANNER",null,"APPROVED","STORED","a.png");db.add(11,1,"BANNER",null,"APPROVED","STORED","b.png");
        denied(()->svc.selectBanner(1,null),"선택값");denied(()->svc.selectBanner(1,new BannerInput(10L,0,null)),"선택값");
        denied(()->svc.selectBanner(9,new BannerInput(10L,0,3L)),"행사 없음");
        db.add(12,2,"BANNER",null,"APPROVED","STORED","c.png");denied(()->svc.selectBanner(1,new BannerInput(12L,0,3L)),"이 행사의");
        db.add(13,1,"FLOOR_PLAN",null,"APPROVED","STORED","map.png");denied(()->svc.selectBanner(1,new BannerInput(13L,0,3L)),"배너 이미지");
        db.add(14,1,"BANNER",4L,"APPROVED","STORED","booth.png");denied(()->svc.selectBanner(1,new BannerInput(14L,0,3L)),"배너 이미지");
        db.add(15,1,"BANNER",null,"PENDING","STORED","a.png");denied(()->svc.selectBanner(1,new BannerInput(15L,0,3L)),"사용 승인");
        db.add(16,1,"BANNER",null,"APPROVED","FAILED","a.png");denied(()->svc.selectBanner(1,new BannerInput(16L,0,3L)),"사용 승인");
        db.add(17,1,"BANNER",null,"APPROVED","STORED",null);denied(()->svc.selectBanner(1,new BannerInput(17L,0,3L)),"사용 승인");
        denied(()->svc.selectBanner(1,new BannerInput(999L,0,3L)),"이미지 후보 없음");
        denied(()->svc.selectBanner(1,new BannerInput(10L,0,2L)),"이미지 상태");
        ok(db.writes==0,"all invalid selections do not write");
        var saved=svc.selectBanner(1,new BannerInput(11L,0,3L));ok(saved.assetId()==11&&saved.revision()==1,"explicit non-first image selected");
        ok(db.assets.get(10L).get("rights_state").equals("APPROVED"),"other image rights preserved");
        denied(()->svc.selectBanner(1,new BannerInput(10L,0,3L)),"선택이 변경");ok(db.writes==1,"stale screen does not overwrite");
        saved=svc.selectBanner(1,new BannerInput(null,1,null));ok(saved.assetId()==null&&saved.revision()==2,"clear explicit selection restores auto");
        db.excluded=true;denied(()->svc.selectBanner(1,new BannerInput(10L,2,3L)),"제외한 행사");
        db.excluded=false;var unset=new CatalogMediaService(db,store,"");denied(()->unset.selectBanner(1,new BannerInput(10L,2,3L)),"사용 승인");
        var initial=svc.detail(10);ok(!initial.offlineAllowed(),"offline permission default false");
        var granted=svc.rights(10,new RightsInput(initial.revision(),"APPROVED","fixture proof","fixture credit",true));ok(granted.offlineAllowed(),"explicit offline approval preserved");
        var revoked=svc.rights(10,new RightsInput(granted.revision(),"REJECTED","withdrawn","credit",true));ok(!revoked.offlineAllowed(),"rejected rights cannot permit offline");
        denied(()->svc.rights(10,new RightsInput(granted.revision(),"APPROVED","old proof","credit",true)),"상태가 변경");
        System.out.println("PASS: "+checks+" actual banner service conditions, JDBC fake; actual SQL/locking tests are opt-in JUnit.");
    }
}
