SELECT tablename, rowsecurity, forceroWsecurity
FROM pg_tables
JOIN pg_class ON pg_class.relname = pg_tables.tablename
WHERE schemaname = 'public'
  AND tablename IN (
    'PlatformUser','Tenant','School','Route','DailyPlan','Production','Delivery','DeliveryStop','Verification','Dispute','TenantAuditLog','Subscription','Invoice','Payment','FileObject','IdempotencyKey'
  )
ORDER BY tablename;

