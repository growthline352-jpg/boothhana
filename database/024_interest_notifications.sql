begin;
set local lock_timeout='5s';
create table if not exists subculture_news_fact (
 id uuid primary key, identity_key text not null unique, kind text not null check(kind in ('EVENT','PRODUCT')),
 target_id text not null, subject_id uuid references subculture_subject(id), creator_id bigint references subculture_exhibitor(id),
 baseline boolean not null, created_at timestamptz not null default now(),
 check((subject_id is null)<>(creator_id is null))
);
create table if not exists subculture_notification (
 id uuid primary key,user_id bigint not null references app_user(id),fact_id uuid not null references subculture_news_fact(id),
 dedupe_key text not null,title text not null,href text not null,created_at timestamptz not null default now(),read_at timestamptz,
 unique(user_id,dedupe_key)
);
create index if not exists idx_notification_inbox on subculture_notification(user_id,created_at desc,id);
create index if not exists idx_notification_unread on subculture_notification(user_id) where read_at is null;
create index if not exists idx_news_fact_target on subculture_news_fact(kind,target_id);
create table if not exists subculture_push_subscription (
 id uuid primary key,user_id bigint not null references app_user(id),endpoint text not null unique,
 p256dh text not null,auth text not null,active boolean not null default true,updated_at timestamptz not null default now()
);
create table if not exists subculture_push_delivery (
 notification_id uuid not null references subculture_notification(id),subscription_id uuid not null references subculture_push_subscription(id),
 state text not null default 'PENDING' check(state in ('PENDING','SENDING','SENT','CANCELED','FAILED')),
 attempts integer not null default 0,available_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,last_status integer,
 primary key(notification_id,subscription_id)
);
create index if not exists idx_push_subscription_owner on subculture_push_subscription(user_id) where active;
create index if not exists idx_push_delivery_pending on subculture_push_delivery(available_at) where state in ('PENDING','SENDING');
do $$ declare t text; r text; runtime_role text:=current_setting('boothhana.backend_role',true); begin
 if runtime_role is null or runtime_role='' or runtime_role in ('anon','authenticated','public') then raise exception 'Set boothhana.backend_role'; end if;
 foreach t in array array['subculture_news_fact','subculture_notification','subculture_push_subscription','subculture_push_delivery'] loop
  execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public',t);
  foreach r in array array['anon','authenticated'] loop
   if exists(select 1 from pg_roles where rolname=r) then
    execute format('revoke all on %I from %I',t,r);
    execute format('drop policy if exists %I on %I','deny_'||r,t);
    execute format('create policy %I on %I as restrictive for all to %I using(false) with check(false)','deny_'||r,t,r);
   end if;
  end loop;
  execute format('grant select,insert,update,delete on %I to %I',t,runtime_role);
  execute format('drop policy if exists notification_server on %I',t);
  execute format('create policy notification_server on %I for all to %I using(true) with check(true)',t,runtime_role);
 end loop;
end $$;
commit;
