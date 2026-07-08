
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated users manage ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      'auth read ' || t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)',
      'auth insert ' || t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
      'auth update ' || t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)',
      'auth delete ' || t, t
    );
  END LOOP;
END $$;
