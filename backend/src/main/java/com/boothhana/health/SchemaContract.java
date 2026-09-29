package com.boothhana.health;

import java.util.List;
import java.util.Map;

/** Explicit application-owned relations through SQL 017. No Supabase system tables. */
public final class SchemaContract {
    private SchemaContract() {}
    public static final Map<String,List<String>> TABLES=Map.ofEntries(
        Map.entry("event_comment",List.of("id","event_id","user_id","body","deleted","created_at")),
        Map.entry("app_user",List.of("id","kakao_subject","display_name","created_at")),
        Map.entry("event",List.of("id","name","start_at","end_at","venue","description","image_key","reservation_start_at","reservation_end_at","status")),
        Map.entry("booth",List.of("id","owner_user_id","name","description","image_key","sns_url")),
        Map.entry("event_booth",List.of("id","event_id","booth_id","booth_number","intro","status","is_public","rejection_reason","version")),
        Map.entry("product",List.of("id","booth_id","name","description","image_key","version")),
        Map.entry("event_product",List.of("id","event_booth_id","product_id","price","stock_mode","stock_quantity","is_sold_out","is_public","reservation_enabled","version")),
        Map.entry("booth_notice",List.of("id","event_booth_id","title","body","is_pinned","created_at")),
        Map.entry("reservation",List.of("id","reservation_no","user_id","event_booth_id","status","qr_token","created_at","picked_up_at","canceled_at")),
        Map.entry("reservation_item",List.of("id","reservation_id","event_product_id","quantity","unit_price")),
        Map.entry("pos_sale",List.of("id","sale_no","event_booth_id","payment_method","status","sold_at")),
        Map.entry("pos_sale_item",List.of("id","pos_sale_id","event_product_id","quantity","unit_price")),
        Map.entry("image_upload",List.of("id","owner_id","target","content_type","file_size","sha256","object_key","state","created_at","expires_at","completed_at")),
        Map.entry("subculture_collection_run",List.of("id","request_hash","execution_mode","web_search_observed","scope_json","request_json","receipt_json","status","summary","started_at","finished_at","received_at")),
        Map.entry("subculture_event_candidate",List.of("id","identity_key","match_key","name","subcategory","venue_name","starts_on","ends_on","payload_json","payload_hash","warnings_json","review_state","reviewed_payload_json","review_note","reviewed_at","revision","possible_duplicate_of","first_seen_at","last_seen_at","overrides_json")),
        Map.entry("subculture_collection_observation",List.of("run_id","candidate_id","payload_json","warnings_json","observed_at")),
        Map.entry("subculture_pipeline_run",List.of("id","week_key","scope_json","state","summary_json","started_at","heartbeat_at","finished_at")),
        Map.entry("subculture_exhibitor",List.of("id","identity_key","name","profile_json","updated_at")),
        Map.entry("subculture_participant",List.of("id","event_id","identity_key","registration_name","payload_json","payload_hash","overrides_json","review_state","review_note","reviewed_payload_json","revision","first_seen_at","last_seen_at","identity_aliases","sales_last_attempt_at","sales_last_success_at","sales_attempt_status","sales_retry_after","sales_failure_count")),
        Map.entry("subculture_participant_member",List.of("participant_id","exhibitor_id")),
        Map.entry("subculture_sales",List.of("participant_id","payload_json","payload_hash","overrides_json","review_state","review_note","reviewed_payload_json","revision","collected_at","latest_payload_json","latest_stage_id","product_checks_json","reviewed_product_checks_json")),
        Map.entry("subculture_catalog_product",List.of("id","participant_id","identity_key","name","payload_json","last_seen_at","identity_aliases","last_seen_stage_id")),
        Map.entry("subculture_stage_run",List.of("id","pipeline_id","event_id","participant_id","stage","request_hash","request_json","coverage_json","receipt_json","status","started_at","finished_at","received_at")),
        Map.entry("subculture_catalog_asset",List.of("id","event_id","participant_id","product_id","identity_key","type","image_url","page_url","caption","reported_rights","rights_state","rights_note","credit","last_attempt_at","storage_state","object_key","sha256","byte_size","content_type","error","revision","created_at","stored_at","offline_allowed")),
        Map.entry("subculture_catalog_review_history",List.of("id","target_type","target_id","before_json","after_json","created_at","actor_id")),
        Map.entry("subculture_catalog_publication",List.of("event_id","snapshot_json","event_revision","published_at")),
        Map.entry("subculture_participant_progress",List.of("event_id","source_key","root_url","next_page_url","pass_no","page_index","revision","state","visited_json","last_pipeline_id","updated_at")),
        Map.entry("subculture_catalog_presentation",List.of("event_id","banner_asset_id","revision","updated_at")),
        Map.entry("subculture_floorplan_watch",List.of("event_id","revision","disabled","last_status","last_checked_at","next_check_at","announced_on","result_json","last_error","lease_id","lease_until")),
        Map.entry("subculture_floorplan_source",List.of("asset_id","scope_json","can_transform","transform_note","revision","current_sha256","checked_at","last_error")),
        Map.entry("subculture_floorplan_version",List.of("id","event_id","asset_id","scope_key","scope_json","sha256","image_width","image_height","content_type","byte_size","object_key","state","geometry_json","mapping_json","manual_links_json","analysis_hash","participant_hash","review_note","revision","created_at","updated_at","analyzed_at")),
        Map.entry("subculture_floorplan_publication",List.of("event_id","scope_key","version_id","snapshot_json","published_at")),
        Map.entry("subculture_floorplan_receipt",List.of("request_id","event_id","request_hash","response_json","created_at")),
        Map.entry("goods_showcase",List.of("product_id","category","enabled","revision","updated_at")),
        Map.entry("memory_item",List.of("id","user_id","event_id","target_type","target_id","participant_id","saved_json","note","planned_day","hall","revision","saved_at","updated_at","last_opened_at","open_count","outbound_count")),
        Map.entry("memory_visit",List.of("user_id","event_id","participant_id","visited_day","created_at")),
        Map.entry("trade_request",List.of("user_id","operation","request_id","request_hash","reservation_id","pos_sale_id","created_at")),
        Map.entry("support_ticket",List.of("id","requester_id","subject_key","request_hash","guest_secret_hash","guest_expires_at","kind","category","title","target_json","received_snapshot_json","received_fingerprint","client_context_json","status","assigned_to","resolution","verified_result_json","exhibitor_id","revision","created_at","updated_at","resolved_at")),
        Map.entry("support_message",List.of("id","ticket_id","actor_id","actor_kind","visibility","body","evidence_json","request_hash","created_at","message_kind")),
        Map.entry("support_action",List.of("id","ticket_id","actor_id","action","details_json","created_at")),
        Map.entry("support_attachment",List.of("id","ticket_id","owner_id","content_type","byte_size","sha256","object_key","state","created_at")),
        Map.entry("exhibitor_manager",List.of("exhibitor_id","user_id","claim_ticket_id","state","permission","granted_by","granted_at","revoked_by","revoked_at","reason","revision")),
        Map.entry("support_rate_limit",List.of("rate_key","window_start","hits")),
        Map.entry("application_action",List.of("id","application_id","application_ref","actor_id","action","before_state","after_state","reason","revision","created_at")));
    public static String probeSql() {
        // Names only come from this fixed contract, never from HTTP parameters.
        return TABLES.entrySet().stream().sorted(Map.Entry.comparingByKey())
            .map(e -> "select 1 ok from (select "+String.join(",",e.getValue())+" from public."+e.getKey()+" limit 0) checked_relation")
            .collect(java.util.stream.Collectors.joining(" union all "));
    }

    /** Derived from SQL001..016; verification/v24 compares every entry to the DDL.
     * This guards same-named but incompatible columns, not just missing columns. */
    public record ColumnShape(String udt,Integer length,boolean notNull) {}
    private static final String COLUMN_SPEC = """
        app_user=id:int8:0:1,kakao_subject:varchar:255:1,display_name:varchar:255:1,created_at:timestamptz:0:1
        application_action=id:int8:0:1,application_id:int8:0:0,application_ref:int8:0:1,actor_id:int8:0:0,action:varchar:24:1,before_state:varchar:32:1,after_state:varchar:32:1,reason:text:0:1,revision:int8:0:1,created_at:timestamptz:0:1
        booth=id:int8:0:1,owner_user_id:int8:0:1,name:varchar:255:1,description:text:0:1,image_key:varchar:512:0,sns_url:varchar:512:0
        booth_notice=id:int8:0:1,event_booth_id:int8:0:1,title:varchar:255:1,body:text:0:1,is_pinned:bool:0:1,created_at:timestamptz:0:1
        event=id:int8:0:1,name:varchar:255:1,start_at:timestamptz:0:1,end_at:timestamptz:0:1,venue:varchar:255:1,description:text:0:1,image_key:varchar:512:0,reservation_start_at:timestamptz:0:0,reservation_end_at:timestamptz:0:0,status:varchar:32:1
        event_booth=id:int8:0:1,event_id:int8:0:1,booth_id:int8:0:1,booth_number:varchar:64:0,intro:text:0:1,status:varchar:32:1,is_public:bool:0:1,rejection_reason:varchar:512:0,version:int8:0:1
        event_product=id:int8:0:1,event_booth_id:int8:0:1,product_id:int8:0:1,price:int8:0:1,stock_mode:varchar:32:1,stock_quantity:int4:0:0,is_sold_out:bool:0:1,is_public:bool:0:1,reservation_enabled:bool:0:1,version:int8:0:1
        exhibitor_manager=exhibitor_id:int8:0:1,user_id:int8:0:1,claim_ticket_id:uuid:0:1,state:varchar:12:1,permission:varchar:32:1,granted_by:int8:0:1,granted_at:timestamptz:0:1,revoked_by:int8:0:0,revoked_at:timestamptz:0:0,reason:text:0:1,revision:int8:0:1
        goods_showcase=product_id:int8:0:1,category:varchar:32:1,enabled:bool:0:1,revision:int8:0:1,updated_at:timestamptz:0:1
        image_upload=id:uuid:0:1,owner_id:int8:0:1,target:varchar:16:1,content_type:varchar:64:1,file_size:int8:0:1,sha256:varchar:64:1,object_key:varchar:512:1,state:varchar:16:1,created_at:timestamptz:0:1,expires_at:timestamptz:0:1,completed_at:timestamptz:0:0
        memory_item=id:uuid:0:1,user_id:int8:0:1,event_id:int8:0:1,target_type:varchar:16:1,target_id:int8:0:1,participant_id:int8:0:0,saved_json:jsonb:0:1,note:varchar:1000:1,planned_day:date:0:0,hall:varchar:150:1,revision:int8:0:1,saved_at:timestamptz:0:1,updated_at:timestamptz:0:1,last_opened_at:timestamptz:0:0,open_count:int4:0:1,outbound_count:int4:0:1
        memory_visit=user_id:int8:0:1,event_id:int8:0:1,participant_id:int8:0:1,visited_day:date:0:1,created_at:timestamptz:0:1
        pos_sale=id:int8:0:1,sale_no:varchar:64:1,event_booth_id:int8:0:1,payment_method:varchar:32:1,status:varchar:32:1,sold_at:timestamptz:0:1
        pos_sale_item=id:int8:0:1,pos_sale_id:int8:0:1,event_product_id:int8:0:1,quantity:int4:0:1,unit_price:int8:0:1
        product=id:int8:0:1,booth_id:int8:0:1,name:varchar:255:1,description:text:0:1,image_key:varchar:512:0,version:int8:0:1
        reservation=id:int8:0:1,reservation_no:varchar:64:1,user_id:int8:0:1,event_booth_id:int8:0:1,status:varchar:32:1,qr_token:varchar:255:1,created_at:timestamptz:0:1,picked_up_at:timestamptz:0:0,canceled_at:timestamptz:0:0
        reservation_item=id:int8:0:1,reservation_id:int8:0:1,event_product_id:int8:0:1,quantity:int4:0:1,unit_price:int8:0:1
        subculture_catalog_asset=id:int8:0:1,event_id:int8:0:1,participant_id:int8:0:0,product_id:int8:0:0,identity_key:bpchar:64:1,type:varchar:20:1,image_url:text:0:1,page_url:text:0:1,caption:text:0:0,reported_rights:text:0:0,rights_state:varchar:20:1,rights_note:text:0:1,credit:text:0:1,last_attempt_at:timestamptz:0:0,storage_state:varchar:20:1,object_key:text:0:0,sha256:bpchar:64:0,byte_size:int8:0:0,content_type:varchar:40:0,error:text:0:1,revision:int8:0:1,created_at:timestamptz:0:1,stored_at:timestamptz:0:0,offline_allowed:bool:0:1
        subculture_catalog_presentation=event_id:int8:0:1,banner_asset_id:int8:0:0,revision:int8:0:1,updated_at:timestamptz:0:1
        subculture_catalog_product=id:int8:0:1,participant_id:int8:0:1,identity_key:bpchar:64:1,name:varchar:255:1,payload_json:jsonb:0:1,last_seen_at:timestamptz:0:1,identity_aliases:jsonb:0:1,last_seen_stage_id:uuid:0:0
        subculture_catalog_publication=event_id:int8:0:1,snapshot_json:jsonb:0:1,event_revision:int8:0:1,published_at:timestamptz:0:1
        subculture_catalog_review_history=id:int8:0:1,target_type:varchar:20:1,target_id:int8:0:1,before_json:jsonb:0:1,after_json:jsonb:0:1,created_at:timestamptz:0:1,actor_id:int8:0:0
        subculture_collection_observation=run_id:uuid:0:1,candidate_id:int8:0:1,payload_json:jsonb:0:1,warnings_json:jsonb:0:1,observed_at:timestamptz:0:1
        subculture_collection_run=id:uuid:0:1,request_hash:bpchar:64:1,execution_mode:varchar:20:1,web_search_observed:bool:0:1,scope_json:jsonb:0:1,request_json:jsonb:0:1,receipt_json:jsonb:0:1,status:varchar:20:1,summary:text:0:1,started_at:timestamptz:0:1,finished_at:timestamptz:0:1,received_at:timestamptz:0:1
        subculture_event_candidate=id:int8:0:1,identity_key:bpchar:64:1,match_key:bpchar:64:1,name:varchar:255:1,subcategory:varchar:30:1,venue_name:varchar:255:0,starts_on:date:0:1,ends_on:date:0:1,payload_json:jsonb:0:1,payload_hash:bpchar:64:1,warnings_json:jsonb:0:1,review_state:varchar:20:1,reviewed_payload_json:jsonb:0:0,review_note:text:0:1,reviewed_at:timestamptz:0:0,revision:int8:0:1,possible_duplicate_of:int8:0:0,first_seen_at:timestamptz:0:1,last_seen_at:timestamptz:0:1,overrides_json:jsonb:0:1
        subculture_exhibitor=id:int8:0:1,identity_key:bpchar:64:1,name:varchar:255:1,profile_json:jsonb:0:1,updated_at:timestamptz:0:1
        subculture_floorplan_publication=event_id:int8:0:1,scope_key:bpchar:64:1,version_id:uuid:0:1,snapshot_json:jsonb:0:1,published_at:timestamptz:0:1
        subculture_floorplan_receipt=request_id:uuid:0:1,event_id:int8:0:1,request_hash:bpchar:64:1,response_json:jsonb:0:1,created_at:timestamptz:0:1
        subculture_floorplan_source=asset_id:int8:0:1,scope_json:jsonb:0:1,can_transform:bool:0:1,transform_note:text:0:1,revision:int8:0:1,current_sha256:bpchar:64:0,checked_at:timestamptz:0:0,last_error:text:0:1
        subculture_floorplan_version=id:uuid:0:1,event_id:int8:0:1,asset_id:int8:0:1,scope_key:bpchar:64:1,scope_json:jsonb:0:1,sha256:bpchar:64:1,image_width:int4:0:1,image_height:int4:0:1,content_type:varchar:40:1,byte_size:int8:0:1,object_key:text:0:0,state:varchar:24:1,geometry_json:jsonb:0:0,mapping_json:jsonb:0:0,manual_links_json:jsonb:0:1,analysis_hash:bpchar:64:0,participant_hash:bpchar:64:0,review_note:text:0:1,revision:int8:0:1,created_at:timestamptz:0:1,updated_at:timestamptz:0:1,analyzed_at:timestamptz:0:0
        subculture_floorplan_watch=event_id:int8:0:1,revision:int8:0:1,disabled:bool:0:1,last_status:varchar:24:1,last_checked_at:timestamptz:0:0,next_check_at:timestamptz:0:1,announced_on:date:0:0,result_json:jsonb:0:1,last_error:text:0:1,lease_id:uuid:0:0,lease_until:timestamptz:0:0
        subculture_participant=id:int8:0:1,event_id:int8:0:1,identity_key:bpchar:64:1,registration_name:varchar:255:1,payload_json:jsonb:0:1,payload_hash:bpchar:64:1,overrides_json:jsonb:0:1,review_state:varchar:20:1,review_note:text:0:1,reviewed_payload_json:jsonb:0:0,revision:int8:0:1,first_seen_at:timestamptz:0:1,last_seen_at:timestamptz:0:1,identity_aliases:jsonb:0:1,sales_last_attempt_at:timestamptz:0:0,sales_last_success_at:timestamptz:0:0,sales_attempt_status:varchar:24:0,sales_retry_after:timestamptz:0:0,sales_failure_count:int4:0:1
        subculture_participant_member=participant_id:int8:0:1,exhibitor_id:int8:0:1
        subculture_participant_progress=event_id:int8:0:1,source_key:bpchar:64:1,root_url:text:0:0,next_page_url:text:0:0,pass_no:int8:0:1,page_index:int4:0:1,revision:int8:0:1,state:varchar:16:1,visited_json:jsonb:0:1,last_pipeline_id:uuid:0:0,updated_at:timestamptz:0:1
        subculture_pipeline_run=id:uuid:0:1,week_key:date:0:1,scope_json:jsonb:0:1,state:varchar:16:1,summary_json:jsonb:0:1,started_at:timestamptz:0:1,heartbeat_at:timestamptz:0:1,finished_at:timestamptz:0:0
        subculture_sales=participant_id:int8:0:1,payload_json:jsonb:0:1,payload_hash:bpchar:64:1,overrides_json:jsonb:0:1,review_state:varchar:20:1,review_note:text:0:1,reviewed_payload_json:jsonb:0:0,revision:int8:0:1,collected_at:timestamptz:0:1,latest_payload_json:jsonb:0:0,latest_stage_id:uuid:0:0,product_checks_json:jsonb:0:1,reviewed_product_checks_json:jsonb:0:1
        subculture_stage_run=id:uuid:0:1,pipeline_id:uuid:0:1,event_id:int8:0:1,participant_id:int8:0:0,stage:varchar:20:1,request_hash:bpchar:64:1,request_json:jsonb:0:1,coverage_json:jsonb:0:1,receipt_json:jsonb:0:1,status:varchar:20:1,started_at:timestamptz:0:1,finished_at:timestamptz:0:1,received_at:timestamptz:0:1
        support_action=id:int8:0:1,ticket_id:uuid:0:0,actor_id:int8:0:0,action:varchar:40:1,details_json:jsonb:0:1,created_at:timestamptz:0:1
        support_attachment=id:uuid:0:1,ticket_id:uuid:0:1,owner_id:int8:0:1,content_type:varchar:30:1,byte_size:int8:0:1,sha256:bpchar:64:1,object_key:varchar:255:1,state:varchar:16:1,created_at:timestamptz:0:1
        support_message=id:uuid:0:1,ticket_id:uuid:0:1,actor_id:int8:0:0,actor_kind:varchar:12:1,visibility:varchar:12:1,body:text:0:1,evidence_json:jsonb:0:1,request_hash:bpchar:64:1,created_at:timestamptz:0:1,message_kind:varchar:12:1
        support_rate_limit=rate_key:bpchar:64:1,window_start:timestamptz:0:1,hits:int4:0:1
        support_ticket=id:uuid:0:1,requester_id:int8:0:0,subject_key:varchar:100:1,request_hash:bpchar:64:1,guest_secret_hash:bpchar:64:0,guest_expires_at:timestamptz:0:0,kind:varchar:16:1,category:varchar:32:1,title:varchar:160:1,target_json:jsonb:0:0,received_snapshot_json:jsonb:0:0,received_fingerprint:bpchar:64:0,client_context_json:jsonb:0:1,status:varchar:24:1,assigned_to:int8:0:0,resolution:varchar:24:0,verified_result_json:jsonb:0:0,exhibitor_id:int8:0:0,revision:int8:0:1,created_at:timestamptz:0:1,updated_at:timestamptz:0:1,resolved_at:timestamptz:0:0
        trade_request=user_id:int8:0:1,operation:varchar:16:1,request_id:uuid:0:1,request_hash:bpchar:64:1,reservation_id:int8:0:0,pos_sale_id:int8:0:0,created_at:timestamptz:0:1
        """;
    public static final Map<String,ColumnShape> COLUMNS = columns();
    private static Map<String,ColumnShape> columns() {
        var out=new java.util.LinkedHashMap<String,ColumnShape>();
        for(String line:COLUMN_SPEC.strip().split("\\R")) {
            String[] row=line.strip().split("=",2);
            for(String cell:row[1].split(",")) {
                String[] s=cell.split(":");
                out.put(row[0]+"."+s[0],new ColumnShape(s[1],s[2].equals("0")?null:Integer.valueOf(s[2]),s[3].equals("1")));
            }
        }
        for(var table:TABLES.entrySet())for(String column:table.getValue())
            if(!out.containsKey(table.getKey()+"."+column))throw new IllegalStateException("Missing typed schema contract");
        if(out.size()!=TABLES.values().stream().mapToInt(List::size).sum())throw new IllegalStateException("Extra typed schema contract");
        return java.util.Collections.unmodifiableMap(out);
    }
    public static String columnProbeSql() {
        return "select table_name,column_name,udt_name,character_maximum_length,is_nullable from information_schema.columns where table_schema='public'";
    }
    public static List<String> columnIssues(List<Map<String,Object>> rows) {
        var actual=new java.util.HashMap<String,Map<String,Object>>();
        for(var row:rows)actual.put(row.get("table_name")+"."+row.get("column_name"),row);
        var issues=new java.util.ArrayList<String>();
        COLUMNS.forEach((key,want)->{
            var row=actual.get(key);
            if(row==null){issues.add("COLUMN_METADATA_MISSING:"+key);return;}
            if(!want.udt().equals(row.get("udt_name")))issues.add("COLUMN_TYPE_MISMATCH:"+key);
            Object length=row.get("character_maximum_length");
            if(want.length()!=null&&(!(length instanceof Number n)||n.intValue()!=want.length()))issues.add("COLUMN_LENGTH_MISMATCH:"+key);
            if(!(want.notNull()?"NO":"YES").equals(row.get("is_nullable")))issues.add("COLUMN_NULLABILITY_MISMATCH:"+key);
        });
        return List.copyOf(issues);
    }
}
