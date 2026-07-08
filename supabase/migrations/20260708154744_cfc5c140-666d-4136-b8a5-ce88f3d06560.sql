DO $$
DECLARE
  p record;
  tbl text;
BEGIN
  -- Drop existing "auth ..." policies
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;

  -- Recreate as permissive for anon + authenticated
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('CREATE POLICY "public read %1$s" ON public.%1$I FOR SELECT TO anon, authenticated USING (true)', tbl);
    EXECUTE format('CREATE POLICY "public insert %1$s" ON public.%1$I FOR INSERT TO anon, authenticated WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY "public update %1$s" ON public.%1$I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', tbl);
    EXECUTE format('CREATE POLICY "public delete %1$s" ON public.%1$I FOR DELETE TO anon, authenticated USING (true)', tbl);
  END LOOP;
END $$;