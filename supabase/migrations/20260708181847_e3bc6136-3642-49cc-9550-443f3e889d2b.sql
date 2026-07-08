ALTER TABLE public.monthly_branch_figures
  ADD COLUMN IF NOT EXISTS eft_xero numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eft_unbanked_deposit numeric NOT NULL DEFAULT 0;