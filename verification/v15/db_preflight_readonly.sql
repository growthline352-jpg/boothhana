-- READ ONLY; no personal rows, notes, or credentials are selected.
begin read only;
select current_database(),current_user;
select t.table_name,c.column_name,c.data_type,c.is_nullable from information_schema.tables t
join information_schema.columns c on c.table_schema=t.table_schema and c.table_name=t.table_name
where t.table_schema='public' and t.table_name in ('memory_item','memory_visit') order by t.table_name,c.ordinal_position;
select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in (to_regclass('public.memory_item'),to_regclass('public.memory_visit'));
select schemaname,tablename,policyname,permissive,roles,cmd from pg_policies where schemaname='public' and tablename in ('memory_item','memory_visit');
select grantee,table_name,privilege_type from information_schema.table_privileges where table_schema='public' and table_name in ('memory_item','memory_visit') order by table_name,grantee;
select conname,convalidated,pg_get_constraintdef(oid) from pg_constraint where conrelid in (to_regclass('public.memory_item'),to_regclass('public.memory_visit')) order by conname;
rollback;
