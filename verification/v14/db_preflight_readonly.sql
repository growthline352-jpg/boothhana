-- READ ONLY metadata and aggregated pending state. Does NOT apply migrations or clean data.
-- After SQL014 exists, run using the actual trusted server role on staging.
begin read only;
select current_database(), current_user, current_schema();
select to_regclass('public.trade_request') as request_table;
select column_name,data_type,is_nullable from information_schema.columns
 where table_schema='public' and table_name='trade_request' order by ordinal_position;
select conname,contype,convalidated,pg_get_constraintdef(oid) as definition
 from pg_constraint where conrelid=to_regclass('public.trade_request');
select c.relname,c.relrowsecurity,p.polname,p.polpermissive,p.polroles
 from pg_class c left join pg_policy p on p.polrelid=c.oid
 where c.oid=to_regclass('public.trade_request');
select grantee,privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name='trade_request';
-- These queries require the corresponding tables to exist. Missing schema is an error, NOT ready.
select operation,count(*) as receipts,min(created_at) as oldest,max(created_at) as newest
 from public.trade_request group by operation;
select state,count(*) as files,min(created_at) as oldest from public.support_attachment group by state;
-- No full ticket text, guest secrets, storage keys or private file bytes are output.
rollback;
