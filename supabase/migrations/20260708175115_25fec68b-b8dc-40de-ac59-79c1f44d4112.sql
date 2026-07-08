ALTER TABLE public.monthly_branch_figures
  ADD COLUMN IF NOT EXISTS petty_cash_recon numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS petty_cash_xero numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS petty_cash_unbanked_deposit numeric NOT NULL DEFAULT 0;