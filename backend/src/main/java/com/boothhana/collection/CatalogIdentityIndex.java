package com.boothhana.collection;

import com.boothhana.api.ApiException;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.boothhana.collection.CatalogModels.*;

/** In-transaction matching. Never merges multiple existing IDs or transfers another parent's media. */
final class CatalogIdentityIndex {
    private final JsonMapper json;
    CatalogIdentityIndex(JsonMapper json) {this.json=json;}
    @SuppressWarnings("unchecked") Set<String> aliases(Map<String,Object> row,boolean product) {
        Set<String> result=new TreeSet<>();
        Object saved=row.get("identity_aliases");
        if(saved!=null) result.addAll(json.readValue(saved.toString(),List.class));
        result.add(row.get("identity_key").toString());
        result.addAll(product?CatalogIdentity.productKeys(json.readValue(row.get("payload_json").toString(),ProductData.class)):
            CatalogIdentity.participantKeys(json.readValue(row.get("payload_json").toString(),Participant.class)));
        return result;
    }
    Map<String,Object> match(List<Map<String,Object>> rows,List<String> keys,Identity identity,boolean product) {
        List<Map<String,Object>> matches=new ArrayList<>();
        for(var row:rows) if(CatalogIdentity.intersects(keys,aliases(row,product))) {
            Identity existing=product?json.readValue(row.get("payload_json").toString(),ProductData.class).identity():
                json.readValue(row.get("payload_json").toString(),Participant.class).identity();
            if(product) {
                var p=json.readValue(row.get("payload_json").toString(),ProductData.class);
                existing=CatalogIdentity.known(existing,p.sourceEntryId(),p.sources());
            } else {
                var p=json.readValue(row.get("payload_json").toString(),Participant.class);
                existing=CatalogIdentity.known(existing,p.sourceEntryId(),p.sources());
            }
            // Distinct known source IDs may legitimately share a listing/detail URL (variants).
            if(CatalogIdentity.conflicts(identity,existing)) continue;
            matches.add(row);
        }
        if(matches.size()>1) throw ApiException.conflict("동일 근거에 기존 ID가 여러 개 연결되어 있습니다. 자동 병합하지 않습니다.");
        return matches.isEmpty()?null:matches.getFirst();
    }
    List<ProductRow> products(Sales sales,List<Map<String,Object>> rows,Map<String,ProductCheck> checks) {
        List<ProductRow> result=new ArrayList<>();
        for(var p:sales.products()) {
            // Explicitly duplicated legacy identities are retained as unlinked review candidates.
            Map<String,Object> row=null;
            try {row=match(rows,CatalogIdentity.productKeys(p),CatalogIdentity.known(p.identity(),p.sourceEntryId(),p.sources()),true);} catch(ApiException ignored) { }
            Long id=row==null?null:((Number)row.get("id")).longValue();
            ProductCheck check=id==null?new ProductCheck("UNKNOWN",null):checks.getOrDefault(id.toString(),new ProductCheck("LEGACY",null));
            result.add(new ProductRow(id,p,check));
        }
        return result;
    }
}
