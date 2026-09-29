begin;
set local lock_timeout='5s';
create table if not exists public.event_comment (
 id uuid primary key,
 event_id bigint not null references public.subculture_event_candidate(id),
 user_id bigint not null references public.app_user(id),
 body text not null check(length(btrim(body)) between 1 and 2000),
 deleted boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists idx_event_comment_page on public.event_comment(event_id,created_at desc,id desc) where deleted=false;
alter table public.event_comment enable row level security;
revoke all on public.event_comment from public;
do $$ declare runtime_role text:=current_setting('boothhana.backend_role',true); api_role text;
begin
 if runtime_role is null or runtime_role='' then raise exception 'Set boothhana.backend_role before applying migration'; end if;
 foreach api_role in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=api_role) then
   execute format('revoke all on public.event_comment from %I',api_role);
   execute format('drop policy if exists %I on public.event_comment','deny_'||api_role);
   execute format('create policy %I on public.event_comment as restrictive for all to %I using(false) with check(false)','deny_'||api_role,api_role);
  end if;
 end loop;
 execute format('grant select,insert,update,delete on public.event_comment to %I',runtime_role);
 drop policy if exists event_comment_server on public.event_comment;
 drop policy if exists boothhana_server_v11 on public.event_comment;
 execute format('create policy boothhana_server_v11 on public.event_comment for all to %I using(true) with check(true)',runtime_role);
end $$;
commit;
