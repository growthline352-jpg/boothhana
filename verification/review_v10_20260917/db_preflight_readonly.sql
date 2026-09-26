-- BoothHana2 v10, 2026-09-17. READ-ONLY METADATA INSPECTION.
-- This is NOT migration 010. Does NOT create/update/drop/grant/revoke any object or data.
-- Current runtime has no PostgreSQL; SQL is provided for DBA review/execution, not live-validated.
-- Expected schema: public. Check actual DB target and search_path before use.
-- Run with ON_ERROR_STOP when using psql. If an error leaves the transaction open, ROLLBACK.
-- Results may reveal schema/role metadata: keep the report internal.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';

-- 1. Target and session; no passwords or table row values.
SELECT current_database() AS database_name, current_user AS executing_role,
       current_setting('search_path') AS search_path,
       current_setting('server_version') AS postgres_version;

-- 2. 32 expected application tables. Supabase system tables are not included.
WITH expected(table_name, introduced_by) AS (VALUES
  ('app_user', '001_initial_schema.sql'),
  ('event', '001_initial_schema.sql'),
  ('booth', '001_initial_schema.sql'),
  ('event_booth', '001_initial_schema.sql'),
  ('product', '001_initial_schema.sql'),
  ('event_product', '001_initial_schema.sql'),
  ('booth_notice', '001_initial_schema.sql'),
  ('reservation', '001_initial_schema.sql'),
  ('reservation_item', '001_initial_schema.sql'),
  ('pos_sale', '001_initial_schema.sql'),
  ('pos_sale_item', '001_initial_schema.sql'),
  ('image_upload', '004_review_v2_safety.sql'),
  ('subculture_collection_run', '005_subculture_collection.sql'),
  ('subculture_event_candidate', '005_subculture_collection.sql'),
  ('subculture_collection_observation', '005_subculture_collection.sql'),
  ('subculture_pipeline_run', '006_subculture_catalog.sql'),
  ('subculture_exhibitor', '006_subculture_catalog.sql'),
  ('subculture_participant', '006_subculture_catalog.sql'),
  ('subculture_participant_member', '006_subculture_catalog.sql'),
  ('subculture_sales', '006_subculture_catalog.sql'),
  ('subculture_catalog_product', '006_subculture_catalog.sql'),
  ('subculture_stage_run', '006_subculture_catalog.sql'),
  ('subculture_catalog_asset', '006_subculture_catalog.sql'),
  ('subculture_catalog_review_history', '006_subculture_catalog.sql'),
  ('subculture_catalog_publication', '006_subculture_catalog.sql'),
  ('subculture_participant_progress', '007_catalog_review_fixes.sql'),
  ('subculture_catalog_presentation', '008_catalog_presentation.sql'),
  ('subculture_floorplan_watch', '009_floorplan_automation.sql'),
  ('subculture_floorplan_source', '009_floorplan_automation.sql'),
  ('subculture_floorplan_version', '009_floorplan_automation.sql'),
  ('subculture_floorplan_publication', '009_floorplan_automation.sql'),
  ('subculture_floorplan_receipt', '009_floorplan_automation.sql')
)
SELECT e.introduced_by, e.table_name,
       CASE WHEN c.oid IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS presence,
       pg_get_userbyid(c.relowner) AS owner_role, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.table_name AND c.relkind IN ('r','p')
ORDER BY e.introduced_by,e.table_name;

-- 3. Selected migration-critical columns. This is NOT a full schema/type compatibility proof.
WITH expected(table_name,column_name,expected_type) AS (VALUES
  ('event_product', 'version', 'bigint'),
  ('product', 'version', 'bigint'),
  ('subculture_event_candidate', 'overrides_json', 'jsonb'),
  ('subculture_participant', 'identity_aliases', 'jsonb'),
  ('subculture_participant', 'sales_last_attempt_at', 'timestamp with time zone'),
  ('subculture_participant', 'sales_last_success_at', 'timestamp with time zone'),
  ('subculture_participant', 'sales_attempt_status', 'character varying'),
  ('subculture_participant', 'sales_retry_after', 'timestamp with time zone'),
  ('subculture_participant', 'sales_failure_count', 'integer'),
  ('subculture_sales', 'latest_payload_json', 'jsonb'),
  ('subculture_sales', 'product_checks_json', 'jsonb'),
  ('subculture_sales', 'reviewed_product_checks_json', 'jsonb'),
  ('subculture_catalog_product', 'identity_aliases', 'jsonb'),
  ('subculture_catalog_product', 'last_seen_stage_id', 'uuid'),
  ('subculture_catalog_presentation', 'banner_asset_id', 'bigint')
)
SELECT e.*,c.data_type,c.is_nullable,c.column_default,
       CASE WHEN c.column_name IS NULL THEN 'MISSING'
            WHEN c.data_type<>e.expected_type THEN 'TYPE_MISMATCH' ELSE 'PRESENT' END AS result
FROM expected e LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
ORDER BY e.table_name,e.column_name;

-- 4. SQL003 CHECK validation. NOT VALID can exist legitimately until historical rows are audited.
WITH expected(table_name,constraint_name) AS (VALUES
 ('event_product','ck_event_product_stock'), ('event_product','ck_event_product_price'),
 ('reservation_item','ck_reservation_item_amounts'), ('pos_sale_item','ck_pos_sale_item_amounts'))
SELECT e.*,p.convalidated,
       CASE WHEN p.oid IS NULL THEN 'MISSING'
            WHEN p.convalidated THEN 'VALIDATED' ELSE 'NOT_VALIDATED_YET' END AS result,
       pg_get_constraintdef(p.oid) AS definition
FROM expected e LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_class t ON t.relnamespace=n.oid AND t.relname=e.table_name
LEFT JOIN pg_constraint p ON p.conrelid=t.oid AND p.conname=e.constraint_name
ORDER BY e.table_name,e.constraint_name;

-- 5. Effective privileges for existing Data API roles. Granted privileges plus exposed schemas
-- and RLS policies determine exposure. Service_role privileges are NOT proof of an anonymous leak.
SELECT r.rolname,c.relname AS table_name,priv.privilege,
       has_schema_privilege(r.oid,n.oid,'USAGE') AS schema_usage,
       c.relrowsecurity AS rls_enabled,r.rolsuper,r.rolbypassrls
FROM pg_roles r CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) AS priv(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role') AND n.nspname='public'
  AND c.relkind IN ('r','p') AND c.relname IN ('app_user', 'event', 'booth', 'event_booth', 'product', 'event_product', 'booth_notice', 'reservation', 'reservation_item', 'pos_sale', 'pos_sale_item', 'image_upload', 'subculture_collection_run', 'subculture_event_candidate', 'subculture_collection_observation', 'subculture_pipeline_run', 'subculture_exhibitor', 'subculture_participant', 'subculture_participant_member', 'subculture_sales', 'subculture_catalog_product', 'subculture_stage_run', 'subculture_catalog_asset', 'subculture_catalog_review_history', 'subculture_catalog_publication', 'subculture_participant_progress', 'subculture_catalog_presentation', 'subculture_floorplan_watch', 'subculture_floorplan_source', 'subculture_floorplan_version', 'subculture_floorplan_publication', 'subculture_floorplan_receipt')
  AND has_table_privilege(r.oid,c.oid,priv.privilege)
ORDER BY r.rolname,c.relname,priv.privilege;

-- 6. Existing policies; none does NOT by itself mean exposed (check RLS and grants).
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('app_user', 'event', 'booth', 'event_booth', 'product', 'event_product', 'booth_notice', 'reservation', 'reservation_item', 'pos_sale', 'pos_sale_item', 'image_upload', 'subculture_collection_run', 'subculture_event_candidate', 'subculture_collection_observation', 'subculture_pipeline_run', 'subculture_exhibitor', 'subculture_participant', 'subculture_participant_member', 'subculture_sales', 'subculture_catalog_product', 'subculture_stage_run', 'subculture_catalog_asset', 'subculture_catalog_review_history', 'subculture_catalog_publication', 'subculture_participant_progress', 'subculture_catalog_presentation', 'subculture_floorplan_watch', 'subculture_floorplan_source', 'subculture_floorplan_version', 'subculture_floorplan_publication', 'subculture_floorplan_receipt')
ORDER BY tablename,policyname;

-- 7. Current executing DB role properties. Repeat separately as actual backend role when possible.
SELECT rolname,rolsuper,rolbypassrls,rolcanlogin,rolinherit
FROM pg_roles WHERE rolname=current_user;

-- 8. Existing migration tools/history are environment-dependent. This source has no automatic runner.
SELECT table_schema,table_name FROM information_schema.tables
WHERE table_name IN ('flyway_schema_history','databasechangelog','schema_migrations')
ORDER BY table_schema,table_name;
COMMIT;
