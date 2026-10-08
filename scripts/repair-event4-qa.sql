-- Targeted correction of the reviewed 2026 autumn stationery event, revision 4.
-- Back up both rows before applying. Rehearse by replacing COMMIT with ROLLBACK.
-- Keep the original collection payload and observations as historical evidence.
begin;
set local lock_timeout='5s';
select pg_advisory_xact_lock(hashtext('boothhana_operating_groups'));
do $repair$
declare
 e subculture_event_candidate%rowtype;
 p subculture_catalog_publication%rowtype;
 obsolete text := '입장료·예약 조건은 미확인입니다. 무료로 가정하지 않았습니다.';
 old_description text := '문구·일러스트 굿즈를 다루는 행사입니다. 회차 포스터와 공식 일정은 확인했고, 개별 참가사와 상품 목록은 추가 수집 대상입니다.';
 description text := '문구·일러스트 굿즈를 다루는 행사입니다. 행사 안내와 확인된 참가 부스·상품 정보를 함께 살펴볼 수 있습니다.';
 warnings jsonb;
 corrected jsonb;
begin
 select * into strict e from subculture_event_candidate where id=4 for update;
 select * into strict p from subculture_catalog_publication where event_id=4 for update;
 if e.name <> '문구전 2026 가을' or e.review_state <> 'REVIEWED'
    or e.publication_withdrawn or e.revision <> 4 or p.event_revision <> 4
    or e.starts_on <> date '2026-10-09' or e.ends_on <> date '2026-10-09'
    or e.reviewed_payload_json->>'description' is distinct from old_description
    or p.snapshot_json->'event'->>'description' is distinct from old_description
    or e.reviewed_payload_json->>'admission' is distinct from '사전 예매 필수. 공식 티켓 페이지 표시가격 3,000원(옵션·잔여량 확인 필요). 현장 판매 미확정.'
    or p.snapshot_json->'event'->>'admission' is distinct from e.reviewed_payload_json->>'admission'
    or e.overrides_json->'warnings' is distinct from e.reviewed_payload_json->'warnings'
    or p.snapshot_json->'event'->'warnings' is distinct from e.reviewed_payload_json->'warnings'
    or not (e.reviewed_payload_json->'warnings' ? obsolete)
    or jsonb_array_length(p.snapshot_json->'participants') <> 184 then
   raise exception 'Event 4 changed: inspect current data before applying this correction';
 end if;
 select coalesce(jsonb_agg(value order by ordinal),'[]'::jsonb) into warnings
 from jsonb_array_elements(e.reviewed_payload_json->'warnings') with ordinality as w(value,ordinal)
 where value <> to_jsonb(obsolete);
 corrected := jsonb_build_object('warnings',warnings,'description',description);
 update subculture_event_candidate set
   overrides_json=overrides_json || corrected,
   reviewed_payload_json=reviewed_payload_json || corrected,
   revision=revision+1,reviewed_at=now(),
   review_note=concat_ws(E'\n',nullif(review_note,''),'2026-10-09 browser QA: remove superseded admission-unknown warning; retain ticket availability caveat; refresh obsolete collection-status description.')
 where id=4;
 update subculture_catalog_publication set
   snapshot_json=jsonb_set(snapshot_json,'{event}',snapshot_json->'event' || corrected),
   event_revision=e.revision+1
 where event_id=4;
 -- This is a copy correction, not a newly collected or newly published event.
 -- Preserve publication timestamps, participant snapshots, admission and prices.
end $repair$;
commit;
