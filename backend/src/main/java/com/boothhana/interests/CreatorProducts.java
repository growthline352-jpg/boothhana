package com.boothhana.interests;

import com.boothhana.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;

/** Independent author catalogs: no inferred event sales, and no unlicensed image publication. */
@Service @Transactional(readOnly=true)
public class CreatorProducts {
 private final JdbcTemplate db;private final JsonMapper json;private final SubcultureInterestService interests;private final com.boothhana.collection.graph.EntityMediaService media;
 @Value("${app.collection.graph.enabled:false}") private boolean enabled;
 public CreatorProducts(JdbcTemplate db,JsonMapper json,SubcultureInterestService interests){this(db,json,interests,null);}
 @org.springframework.beans.factory.annotation.Autowired public CreatorProducts(JdbcTemplate db,JsonMapper json,SubcultureInterestService interests,com.boothhana.collection.graph.EntityMediaService media){this.db=db;this.json=json;this.interests=interests;this.media=media;}
 public Map<String,Object> list(UUID subjectId,Long creatorId,int page){
  if(page<0||page>1000)throw ApiException.badRequest("페이지를 확인해 주세요.");
  if(!enabled)return Map.of("items",List.of(),"hasMore",false,"page",page);
  var args=new ArrayList<Object>();String filter="";
  if(subjectId!=null){interests.subject(subjectId);filter+=" and exists(select 1 from collection_product_subject ps join subculture_subject s on s.id=ps.subject_id left join subculture_subject w on w.id=s.work_id where ps.product_id=p.id and ps.active and s.active and (w.id is null or w.active) and (s.id=? or s.work_id=?))";args.add(subjectId);args.add(subjectId);}
  if(creatorId!=null){interests.creator(creatorId);var ids=interests.relatedCreatorIds(Set.of(creatorId));filter+=" and p.exhibitor_id in ("+String.join(",",Collections.nCopies(ids.size(),"?"))+")";args.addAll(ids);}
  return query(filter,args,page);
 }
 public Map<String,Object> mine(long owner,UUID interestId,int page){
  if(page<0||page>1000)throw ApiException.badRequest("페이지를 확인해 주세요.");
  if(!enabled)return Map.of("items",List.of(),"hasMore",false,"page",page);
  if(interestId!=null&&interests.settings(owner).entries().stream().noneMatch(e->e.id().equals(interestId)))throw ApiException.notFound("관심 항목을 찾지 못했습니다.");
  var args=new ArrayList<Object>();args.add(owner);if(interestId!=null)args.add(interestId);
  String filter=" and exists(select 1 from subculture_interest i where i.user_id=?"+(interestId==null?"":" and i.id=?")+" and (exists(select 1 from collection_product_subject ps join subculture_subject s on s.id=ps.subject_id join subculture_subject w on w.id=s.work_id where ps.product_id=p.id and ps.active and s.active and w.active and (i.subject_id=s.id or i.subject_id=s.work_id)) or coalesce((select canonical_id from collection_creator_identity where alias_id=i.exhibitor_id and active),i.exhibitor_id)=coalesce((select canonical_id from collection_creator_identity where alias_id=p.exhibitor_id and active),p.exhibitor_id)))";
  return query(filter,args,page);
 }
 private Map<String,Object> query(String filter,ArrayList<Object> args,int page){
  args.add(page*24);
  var rows=db.queryForList("select p.id,p.exhibitor_id,p.data_json,p.created_at,c.data_json as creator_json from collection_product p join collection_creator_publication c on c.exhibitor_id=p.exhibitor_id where p.active and p.verdict_id is not null and c.active"+filter+" order by p.created_at desc,p.id limit 25 offset ?",args.toArray());
  var items=rows.stream().limit(24).map(this::view).toList();if(media!=null){media.attach("PRODUCT",items);media.attach("CREATOR",items.stream().map(item->(Map<String,Object>)item.get("creator")).toList());}
  return Map.of("items",items,"hasMore",rows.size()>24,"page",page);
 }
 public Map<String,Object> detail(UUID id){
  if(!enabled)throw ApiException.notFound("공개된 상품을 찾지 못했습니다.");
  var rows=db.queryForList("select p.id,p.exhibitor_id,p.data_json,p.created_at,c.data_json as creator_json from collection_product p join collection_creator_publication c on c.exhibitor_id=p.exhibitor_id where p.id=? and p.active and p.verdict_id is not null and c.active",id);
  if(rows.isEmpty())throw ApiException.notFound("공개된 상품을 찾지 못했습니다.");var value=view(rows.getFirst());if(media!=null){media.attach("PRODUCT",List.of(value));media.attach("CREATOR",List.of((Map<String,Object>)value.get("creator")));}return value;
 }
 @SuppressWarnings("unchecked") private Map<String,Object> view(Map<String,Object> row){
  var data=new LinkedHashMap<String,Object>(json.readValue(row.get("data_json").toString(),Map.class));data.remove("images");
  var subjects=db.queryForList("select s.id,s.name,w.name as \"workName\" from collection_product_subject ps join subculture_subject s on s.id=ps.subject_id join subculture_subject w on w.id=s.work_id where ps.product_id=? and ps.active and s.active and w.active order by s.name,s.id",row.get("id"));
  var creator=new LinkedHashMap<String,Object>(json.readValue(row.get("creator_json").toString(),Map.class));creator.put("id",row.get("exhibitor_id"));
  return new LinkedHashMap<>(Map.of("id",row.get("id"),"creatorId",row.get("exhibitor_id"),"creator",creator,"data",data,"subjects",subjects,"status","PAST_REFERENCE".equals(data.get("evidenceScope"))?"과거 판매 기록":"작가 상품 · 행사 판매 미확인"));
 }
}
