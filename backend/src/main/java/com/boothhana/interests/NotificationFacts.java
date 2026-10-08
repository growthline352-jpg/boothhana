package com.boothhana.interests;

/** Shared predicates for producing and delivering facts. All identifiers below are fixed SQL aliases. */
final class NotificationFacts {
 private NotificationFacts(){}
 static final String MATCHES="""
  ((f.subject_id is not null and (i.subject_id=f.subject_id or i.subject_id=(select work_id from subculture_subject where id=f.subject_id)))
   or (f.creator_id is not null and coalesce((select canonical_id from collection_creator_identity where alias_id=i.exhibitor_id and active),i.exhibitor_id)
       =coalesce((select canonical_id from collection_creator_identity where alias_id=f.creator_id and active),f.creator_id)))
  """;
 static final String SUBJECT_ACTIVE="""
  (f.subject_id is null or exists(select 1 from subculture_subject s left join subculture_subject w on w.id=s.work_id
    where s.id=f.subject_id and s.active and (s.work_id is null or w.active)))
  """;
 // l = subject link, pub = current public snapshot. An inbox row cannot revive private or stale evidence.
 static final String EVENT_LINK="""
  ((l.kind='EVENT' and (l.reviewed_by is not null or l.target_snapshot_json=pub.snapshot_json->'event'))
   or (l.kind='PRODUCT' and exists(
    select 1 from subculture_participant p join subculture_sales sale on sale.participant_id=p.id,
     jsonb_array_elements(pub.snapshot_json->'participants') person,
     jsonb_array_elements(person->'productRows') product
    where p.id=l.participant_id and p.event_id=l.event_id and p.review_state<>'EXCLUDED' and sale.review_state<>'EXCLUDED'
     and person->>'id'=p.id::text and person->'sales'<>'null'::jsonb and product->>'id'=l.target_id::text
     and product->'data'->>'evidenceScope' in ('EVENT_LISTED','EVENT_SALE_CONFIRMED')
     and coalesce(product->'data'->>'saleState','UNKNOWN')<>'CANCELED'
     and (l.reviewed_by is not null or (l.target_snapshot_json-'images')=((product->'data')-'images')))))
  """;
 static final String EVENT_CREATOR="""
  exists(select 1 from subculture_participant p join subculture_participant_member pm on pm.participant_id=p.id
   join subculture_exhibitor creator on creator.id=pm.exhibitor_id,
   jsonb_array_elements(pub.snapshot_json->'participants') person,
   jsonb_array_elements(person->'participant'->'members') member
   where p.event_id=pub.event_id and p.review_state<>'EXCLUDED' and pm.exhibitor_id=f.creator_id
    and person->>'id'=p.id::text and member->>'name'=creator.profile_json->>'name'
    and member->>'profileUrl' is not distinct from creator.profile_json->>'profileUrl'
    and not exists(select 1 from collection_creator_publication cp where cp.exhibitor_id=creator.id and not cp.active))
  """;
 static final String CURRENT="""
  ((f.kind='PRODUCT' and exists(select 1 from collection_product p join collection_creator_publication c on c.exhibitor_id=p.exhibitor_id
   where p.id::text=f.target_id and p.active and c.active and p.verdict_id is not null
    and coalesce(p.data_json->>'evidenceScope','UNKNOWN')<>'PAST_REFERENCE'
    and (f.creator_id=p.exhibitor_id or exists(select 1 from collection_product_subject ps where ps.product_id=p.id and ps.subject_id=f.subject_id and ps.active))))
  or (f.kind='EVENT' and exists(select 1 from subculture_catalog_publication pub join subculture_event_candidate e on e.id=pub.event_id
   where e.id::text=f.target_id and e.review_state<>'EXCLUDED'
    and coalesce(pub.snapshot_json->'event'->'operationStatus'->>'state','UNKNOWN') not in ('CANCELED','POSTPONED')
    and ((f.subject_id is not null and exists(select 1 from subculture_subject_link l where l.event_id=e.id and l.subject_id=f.subject_id and l.active and
  """+EVENT_LINK+")) or (f.creator_id is not null and "+EVENT_CREATOR+")))))";
}
