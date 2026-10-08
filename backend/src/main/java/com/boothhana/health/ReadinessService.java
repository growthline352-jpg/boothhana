package com.boothhana.health;

import com.boothhana.api.FailureDiagnostics;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

@Service
public class ReadinessService {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(ReadinessService.class);
    private final JdbcTemplate db;
    @org.springframework.beans.factory.annotation.Value("${app.collection.graph.enabled:false}") private boolean graphEnabled;
    private volatile Report cached;
    private long expiresAt;
    public ReadinessService(JdbcTemplate db){this.db=db;}
    public record Report(boolean ready,String checkedAt,List<String> issues,String diagnosticId) {}
    @Transactional(readOnly=true,timeout=5)
    public synchronized Report check() {
        long now=System.nanoTime();
        if(cached!=null&&now<expiresAt)return cached;
        List<String> issues=new ArrayList<>();String diagnosticId=null;
        try {
            // Resolves all tables and their required columns under the real JDBC role; reads zero business rows.
            db.queryForList(SchemaContract.probeSql());
            if(graphEnabled){
                db.queryForList("select p.identity_aliases,s.system_verdict_id,m.system_verdict_id from collection_product p,event_series s,event_series_member m where false");
                var graphTables=List.of("collection_job","collection_extraction","collection_verdict","collection_product","collection_product_subject","collection_creator_publication","collection_migration","collection_image_part","collection_subject_identity","collection_creator_identity","collection_identity_history","subculture_news_fact","subculture_notification","subculture_push_subscription","subculture_push_delivery","subculture_subject","subculture_subject_link","subculture_interest","subculture_interest_settings");
                for(String table:graphTables){
                    db.queryForList("select 1 from "+table+" where false");
                    var checks=db.queryForMap("select c.relrowsecurity,has_table_privilege(current_user,c.oid,'INSERT') and has_table_privilege(current_user,c.oid,'UPDATE') and has_table_privilege(current_user,c.oid,'DELETE') writable,exists(select 1 from pg_roles a where a.rolname in ('anon','authenticated') and has_table_privilege(a.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE')) exposed from pg_class c where c.oid=cast(? as regclass)",table);
                    if(!Boolean.TRUE.equals(checks.get("relrowsecurity"))||!Boolean.TRUE.equals(checks.get("writable"))||Boolean.TRUE.equals(checks.get("exposed")))issues.add("GRAPH_TABLE_SECURITY_INVALID:"+table);
                }
                if(db.queryForObject("select count(*) from pg_constraint where conname in ('event_series_review_actor','event_series_member_review_actor')",Integer.class)!=2)issues.add("GRAPH_SERIES_CONSTRAINT_MISSING");
            }
            issues.addAll(SchemaContract.columnIssues(db.queryForList(SchemaContract.columnProbeSql())));
            var metadata=db.queryForList("""
                select c.relname,c.relrowsecurity,
                  (r.rolsuper or r.rolbypassrls or (c.relowner=r.oid and not c.relforcerowsecurity)
                   or exists(select 1 from pg_policy pol where pol.polrelid=c.oid
                     and pol.polname in ('boothhana_server_v11','collection_server','notification_server') and r.oid=any(pol.polroles))) server_policy,
                  (has_table_privilege(current_user,c.oid,'SELECT')
                   and has_table_privilege(current_user,c.oid,'INSERT')
                   and has_table_privilege(current_user,c.oid,'UPDATE')
                   and has_table_privilege(current_user,c.oid,'DELETE')) server_grants,
                  exists(select 1 from pg_roles api where api.rolname in ('anon','authenticated')
                    and (has_table_privilege(api.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
                      or has_any_column_privilege(api.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) api_grants
                from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  join pg_roles r on r.rolname=current_user
                where n.nspname='public' and c.relkind in ('r','p')
                """);
            Set<String> found=new HashSet<>();
            for(var row:metadata){
                String table=(String)row.get("relname");if(!SchemaContract.TABLES.containsKey(table))continue;found.add(table);
                if(!Boolean.TRUE.equals(row.get("relrowsecurity")))issues.add("RLS_DISABLED:"+table);
                if(!Boolean.TRUE.equals(row.get("server_grants")))issues.add("SERVER_GRANT_MISSING:"+table);
                if(!Boolean.TRUE.equals(row.get("server_policy")))issues.add("SERVER_RLS_POLICY_UNVERIFIED:"+table);
                if(Boolean.TRUE.equals(row.get("api_grants")))issues.add("DATA_API_GRANT_PRESENT:"+table);
            }
            for(String table:SchemaContract.TABLES.keySet())if(!found.contains(table))issues.add("APPLICATION_TABLE_MISSING:"+table);
        }catch(RuntimeException e){
            diagnosticId=UUID.randomUUID().toString();issues.add("SCHEMA_OR_DATABASE_UNAVAILABLE");
            log.warn("readinessId={} diagnostic={}",diagnosticId,FailureDiagnostics.summary(e));
        }
        cached=new Report(issues.isEmpty(),Instant.now().toString(),List.copyOf(issues),diagnosticId);
        expiresAt=System.nanoTime()+5_000_000_000L;
        return cached;
    }
}
