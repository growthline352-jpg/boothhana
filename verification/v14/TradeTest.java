package com.boothhana.service;
import java.util.*;
import com.boothhana.api.ApiException;
import com.boothhana.api.ApiModels.*;
import org.springframework.jdbc.core.JdbcTemplate;
/** Actual trade rules/request service; scripted SQL, NOT real advisory locking or JPA. */
public class TradeTest {
 static int count;static void ok(boolean v,String label){count++;if(!v)throw new AssertionError(label);}
 static void fail(int code,Runnable fn){count++;try{fn.run();throw new AssertionError("not rejected");}catch(ApiException e){if(e.status.value()!=code)throw new AssertionError("wrong status",e);}}
 static class Db extends JdbcTemplate {
  Map<List<Object>,Map<String,Object>> rows=new HashMap<>();boolean locked;int inserts;
  @Override public void execute(String s){if(!s.contains("lock_timeout"))throw new AssertionError(s);}
  @Override public List<Map<String,Object>> queryForList(String sql,Object...a){if(sql.contains("pg_advisory_xact_lock")){locked=true;return List.of();}var row=rows.get(List.of(a[0],a[1],a[2]));return row==null?List.of():List.of(row);}
  @Override public int update(String sql,Object...a){if(!locked)throw new AssertionError("no lock before insert");inserts++;rows.put(List.of(a[0],a[1],a[2]),Map.of("request_hash",a[3],"result_id",a[4]!=null?a[4]:a[5]));return 1;}
 }
 public static void main(String[] args){
  var lines=List.of(new LineInput(5L,2),new LineInput(3L,1));String hash=TradeRequestRules.fingerprint(10L,"CASH",lines);
  ok(hash.equals(TradeRequestRules.fingerprint(10L,"CASH",List.of(lines.get(1),lines.get(0)))),"line order canonical");ok(hash.length()==64,"sha256");
  ok(!hash.equals(TradeRequestRules.fingerprint(10L,"TRANSFER",lines)),"payment method included");ok(!hash.equals(TradeRequestRules.fingerprint(11L,"CASH",lines)),"booth included");
  fail(400,()->TradeRequestRules.fingerprint(10L,"CASH",List.of(new LineInput(1L,0))));fail(400,()->TradeRequestRules.fingerprint(10L,"CASH",List.of(new LineInput(1L,1),new LineInput(1L,2))));
  fail(400,()->TradeRequestRules.fingerprint(10L,"CASH",List.of()));
  var db=new Db();var service=new TradeRequestService(db);UUID id=UUID.randomUUID();
  ok(service.begin(1L,"POS",id,hash).isEmpty(),"new request");service.complete(1L,"POS",id,hash,99L);
  ok(service.begin(1L,"POS",id,hash).orElseThrow()==99L,"repeat returns same result");ok(db.inserts==1,"receipt once");
  fail(409,()->service.begin(1L,"POS",id,"f".repeat(64)));ok(service.begin(2L,"POS",id,hash).isEmpty(),"other account namespace");ok(service.begin(1L,"RESERVATION",id,hash).isEmpty(),"other operation namespace");
  ok(Boolean.TRUE.equals(service.receipt(1L,"POS",id).get("found")),"owner receipt");ok(Boolean.FALSE.equals(service.receipt(2L,"POS",id).get("found")),"another user indistinguishable from missing");
  fail(400,()->service.begin(1L,"POS",null,hash));fail(400,()->service.begin(1L,"ADMIN",id,hash));fail(400,()->service.begin(null,"POS",id,hash));
  System.out.println("PASS v14 trade rules/receipt "+count+" assertions; scripted JDBC only");
 }
}
