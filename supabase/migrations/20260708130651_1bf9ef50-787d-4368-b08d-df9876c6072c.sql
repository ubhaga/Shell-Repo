ALTER TABLE public.monthly_branch_figures 
  ADD COLUMN IF NOT EXISTS cash_connect_invoice_incl_vat numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_charges_adj numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS explanation_bank_charges text NOT NULL DEFAULT '';