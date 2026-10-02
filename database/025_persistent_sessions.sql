-- Spring Session JDBC schema. Contains authentication material: trusted server only.
begin;
set local lock_timeout='5s';
create table booth_session (
 primary_id char(36) not null primary key,
 session_id char(36) not null,
 creation_time bigint not null,
 last_access_time bigint not null,
 max_inactive_interval integer not null,
 expiry_time bigint not null,
 principal_name varchar(100)
);
create unique index booth_session_id_idx on booth_session(session_id);
create index booth_session_expiry_idx on booth_session(expiry_time);
create index booth_session_principal_idx on booth_session(principal_name);
create table booth_session_attributes (
 session_primary_id char(36) not null references booth_session(primary_id) on delete cascade,
 attribute_name varchar(200) not null,
 attribute_bytes bytea not null,
 primary key(session_primary_id,attribute_name)
);
alter table booth_session enable row level security;
alter table booth_session_attributes enable row level security;
revoke all on booth_session,booth_session_attributes from public;
do $$
declare runtime_role text:=coalesce(nullif(current_setting('boothhana.backend_role',true),''),current_user); role_name text; table_name text;
begin
 if lower(runtime_role) in ('public','anon','authenticated') then raise exception 'Trusted JDBC role required'; end if;
 foreach table_name in array array['booth_session','booth_session_attributes'] loop
  foreach role_name in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=role_name) then
    execute format('revoke all on %I from %I',table_name,role_name);
   end if;
  end loop;
  execute format('grant select,insert,update,delete on %I to %I',table_name,runtime_role);
  execute format('create policy boothhana_server_v11 on %I for all to %I using (true) with check (true)',table_name,runtime_role);
 end loop;
end $$;
commit;
