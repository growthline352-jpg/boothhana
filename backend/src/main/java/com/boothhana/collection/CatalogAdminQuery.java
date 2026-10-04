package com.boothhana.collection;

import com.boothhana.api.ApiException;
import java.util.*;

/** Filter effective data, not the last collected text, using bound values. */
public record CatalogAdminQuery(String query,String category,String state,String publication,String image) {
 public CatalogAdminQuery(String query,String category,String state,String publication){this(query,category,state,publication,"");}
 public static final String PENDING="(e.review_state='PENDING' or exists(select 1 from subculture_participant cp where cp.event_id=e.id and cp.review_state='PENDING') or exists(select 1 from subculture_sales cs join subculture_participant cp on cp.id=cs.participant_id where cp.event_id=e.id and cp.review_state<>'EXCLUDED' and cs.review_state='PENDING'))";
 public CatalogAdminQuery {
  query=query==null?"":query.strip();category=category==null?"":category;state=state==null?"":state;publication=publication==null?"":publication;image=image==null?"":image;
  if(query.length()>100||!category.isEmpty()&&!CatalogTaxonomy.GROUPS.containsKey(category)||!Set.of("","PENDING","REVIEWED","EXCLUDED").contains(state)||!Set.of("","PUBLISHED","UNPUBLISHED","PENDING").contains(publication))throw ApiException.badRequest("검색 조건을 확인해 주세요.");
  if(!Set.of("","MISSING","WAITING_REVIEW","WAITING_STORAGE","STORAGE_FAILED","SELECTION_BLOCKED","READY").contains(image))throw ApiException.badRequest("이미지 검색 조건을 확인해 주세요.");
 }
 public String where(List<Object> args) {
  List<String> clauses=new ArrayList<>();
  if(!query.isEmpty()) {String q="%"+query.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";clauses.add("((e.payload_json||e.overrides_json)->>'name' ilike ? or (e.payload_json||e.overrides_json)->>'venueName' ilike ?)");args.add(q);args.add(q);}
  if(!category.isEmpty()){var types=CatalogTaxonomy.GROUPS.get(category);clauses.add("(e.payload_json||e.overrides_json)->>'subcategory' in ("+String.join(",",Collections.nCopies(types.size(),"?"))+")");args.addAll(types);}
  if(!state.isEmpty()){clauses.add("e.review_state=?");args.add(state);}
  if(!publication.isEmpty())clauses.add((publication.equals("UNPUBLISHED")?"not ":"")+"exists(select 1 from subculture_catalog_publication pub where pub.event_id=e.id)");
  if(publication.equals("PENDING"))clauses.add(PENDING);
  if(!image.isEmpty())clauses.add(switch(image){
   case "MISSING" -> "bh.ready=0";
   case "WAITING_REVIEW" -> "bh.pending>0";
   case "WAITING_STORAGE" -> "bh.waiting>0";
   case "STORAGE_FAILED" -> "bh.failed>0";
   default -> {args.add(image);yield "("+CatalogBannerHealth.STATE+")=?";}
  });
  return clauses.isEmpty()?"":" where "+String.join(" and ",clauses);
 }
}
