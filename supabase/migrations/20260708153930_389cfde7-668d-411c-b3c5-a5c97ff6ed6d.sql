
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'bank_line_allocations',
    'bank_statement_lines',
    'creditor_opening_balances',
    'daily_cashups',
    'day_end_uploads',
    'manager_daily_entries',
    'manual_pump_readings',
    'master_data',
    'monthly_branch_figures',
    'other_adjustment_categories',
    'pump_variance_revisions',
    'speedpoint_diff_clearances',
    'speedpoint_manual_matches'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all access to ' || t, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'Authenticated users manage ' || t, t
    );
  END LOOP;
END $$;
