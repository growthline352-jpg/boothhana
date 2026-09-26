-- Run only after existing catalog SQL 005/006 is installed. READ ONLY, no automatic republication.
begin read only;
select e.id,e.name,e.review_state,e.revision,p.event_revision,p.published_at,
  coalesce(e.reviewed_payload_json->'operationStatus'->>'state','UNKNOWN') reviewed_state,
  coalesce(p.snapshot_json->'event'->'operationStatus'->>'state','UNKNOWN') published_state,
  (e.reviewed_payload_json->'operationStatus' is distinct from p.snapshot_json->'event'->'operationStatus') status_or_evidence_differs
from subculture_event_candidate e join subculture_catalog_publication p on p.event_id=e.id
where e.reviewed_payload_json is not null
  and e.reviewed_payload_json->'operationStatus' is distinct from p.snapshot_json->'event'->'operationStatus'
order by e.id;
commit;
-- Compare official evidence and review state in the admin before publishing individually.
-- Do not copy payload_json (unreviewed observations) directly into public snapshots.
