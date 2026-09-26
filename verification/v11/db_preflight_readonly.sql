-- v11 READ ONLY. Run using the real JDBC role as well as the migration owner.
-- No rows containing user data, payments, tokens, sale quantities or private notes are returned.
begin read only;
select current_database() database_name,current_user jdbc_role,current_schema() schema_name;
with expected(name) as (values ('app_user'),
('event'),
('booth'),
('event_booth'),
('product'),
('event_product'),
('booth_notice'),
('reservation'),
('reservation_item'),
('pos_sale'),
('pos_sale_item'),
('image_upload'),
('subculture_collection_run'),
('subculture_event_candidate'),
('subculture_collection_observation'),
('subculture_pipeline_run'),
('subculture_exhibitor'),
('subculture_participant'),
('subculture_participant_member'),
('subculture_sales'),
('subculture_catalog_product'),
('subculture_stage_run'),
('subculture_catalog_asset'),
('subculture_catalog_review_history'),
('subculture_catalog_publication'),
('subculture_participant_progress'),
('subculture_catalog_presentation'),
('subculture_floorplan_watch'),
('subculture_floorplan_source'),
('subculture_floorplan_version'),
('subculture_floorplan_publication'),
('subculture_floorplan_receipt'),
('goods_showcase'))
select x.name,c.oid is not null exists_table,c.relrowsecurity rls_enabled,
  pg_get_userbyid(c.relowner) owner,
  case when c.oid is null then false else has_table_privilege(current_user,c.oid,'SELECT') end server_select,
  case when c.oid is null then false else has_table_privilege(current_user,c.oid,'INSERT') end server_insert,
  case when c.oid is null then false else has_table_privilege(current_user,c.oid,'UPDATE') end server_update,
  case when c.oid is null then false else has_table_privilege(current_user,c.oid,'DELETE') end server_delete,
  array(select r.rolname from pg_roles r where r.rolname in ('anon','authenticated') and
    (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or
     has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) api_roles_with_grants
from expected x left join pg_class c on c.oid=to_regclass('public.'||quote_ident(x.name)) and c.relkind in ('r','p')
order by x.name;
-- A clean table report is NOT a complete audit of exposed views, RPC/security-definer functions or other schemas.
commit;
