CREATE TABLE public.speedpoint_auto_unmatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL,
  bank_line_id uuid NOT NULL REFERENCES public.bank_statement_lines(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_line_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speedpoint_auto_unmatches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.speedpoint_auto_unmatches TO anon;
GRANT ALL ON public.speedpoint_auto_unmatches TO service_role;
ALTER TABLE public.speedpoint_auto_unmatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read speedpoint_auto_unmatches" ON public.speedpoint_auto_unmatches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert speedpoint_auto_unmatches" ON public.speedpoint_auto_unmatches FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update speedpoint_auto_unmatches" ON public.speedpoint_auto_unmatches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete speedpoint_auto_unmatches" ON public.speedpoint_auto_unmatches FOR DELETE TO anon, authenticated USING (true);