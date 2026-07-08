ALTER TABLE public.monthly_branch_figures
  ADD COLUMN IF NOT EXISTS airtime_bld_xero numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS airtime_easypay_xero numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS airtime_lotto_xero numeric NOT NULL DEFAULT 0;