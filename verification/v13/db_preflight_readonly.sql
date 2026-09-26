-- READ ONLY; no data, grants, statuses or evidence are changed.
select current_database(),current_user;
select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name='support_message' and column_name='message_kind';
select conname,convalidated,pg_get_constraintdef(oid)
from pg_constraint where conrelid='public.support_message'::regclass and conname='ck_support_message_kind';
select relname,relrowsecurity,relforcerowsecurity from pg_class
where oid in ('public.support_ticket'::regclass,'public.support_message'::regclass,'public.support_attachment'::regclass);
-- Old map reports need manual review; never replace their evidence with today's coordinates.
select status,coalesce(received_snapshot_json->>'comparisonVersion','LEGACY') comparison_version,count(*)
from public.support_ticket where target_json->>'type'='FLOORPLAN'
group by 1,2 order by 1,2;
-- Candidates for HUMAN review, not proof that every waiting ticket should be reopened.
select count(*) as waiting_with_attachment_after_last_request
from public.support_ticket t where t.status='WAITING_USER' and exists(
 select 1 from public.support_attachment a where a.ticket_id=t.id and a.state='STORED'
 and a.created_at>(select max(x.created_at) from public.support_action x where x.ticket_id=t.id and x.action='WAIT')
);
