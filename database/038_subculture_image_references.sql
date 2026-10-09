-- Identity-verified native references are distinct from permission to store a copy.
begin;
set local lock_timeout='5s';
alter table subculture_entity_media drop constraint if exists subculture_entity_media_review_verdict_check;
alter table subculture_entity_media add constraint subculture_entity_media_review_verdict_check
 check(review_verdict in ('APPROVE','REFERENCE','ENRICH','REJECT','STALE'));
alter table subculture_entity_media drop constraint if exists entity_media_reference_check;
alter table subculture_entity_media add constraint entity_media_reference_check
 check(review_verdict<>'REFERENCE' or (usage_status='UNKNOWN' and rights_state='PENDING'
  and storage_state='PENDING' and object_key is null and review_audit_json is not null
  and coalesce(candidate_json->>'sourceIsOfficial','false')='true'
  and candidate_json->>'identitySourceUrl' is not null
  and length(coalesce(candidate_json->>'identitySourceEvidence',''))>0));
commit;
