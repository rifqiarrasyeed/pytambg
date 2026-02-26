DO $$
DECLARE
  role_targets text[] := ARRAY[]::text[];
  role_sql text;
  table_name text;
  protected_tables text[] := ARRAY[
    'PlatformUser','PlatformRole','PlatformUserRole','PlatformAuditLog','PlatformSetting',
    'Tenant','TenantSetting','TenantRole','TenantMember','TenantMemberRole',
    'School','Route','RouteStop','MenuItem',
    'SubscriptionPlan','PlanFeature','PlanLimit','Subscription','Invoice','Payment','MidtransEvent',
    'DailyPlan','DailyPlanItem','Production','ProductionAttachment','Delivery','DeliveryStop','DeliveryProof','DeliveryStatusLog','Verification','Dispute',
    'TenantAuditLog','IdempotencyKey','FileObject'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    role_targets := array_append(role_targets, 'anon');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    role_targets := array_append(role_targets, 'authenticated');
  END IF;

  IF array_length(role_targets, 1) IS NULL THEN
    RAISE NOTICE 'Role anon/authenticated tidak ditemukan. Skip apply RLS policy.';
    RETURN;
  END IF;

  SELECT string_agg(format('%I', role_name), ', ')
  INTO role_sql
  FROM unnest(role_targets) AS role_name;

  FOREACH table_name IN ARRAY protected_tables LOOP
    EXECUTE format('ALTER TABLE "%s" ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE "%s" FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS deny_all_clients ON "%s"', table_name);
    EXECUTE format(
      'CREATE POLICY deny_all_clients ON "%s" FOR ALL TO %s USING (false) WITH CHECK (false)',
      table_name,
      role_sql
    );
  END LOOP;

  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %s', role_sql);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %s', role_sql);
END;
$$;

