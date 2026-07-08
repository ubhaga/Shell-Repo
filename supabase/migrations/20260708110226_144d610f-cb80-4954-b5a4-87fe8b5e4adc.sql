UPDATE public.manager_daily_entries
SET bank_charges = ROUND((bank_charges * 40.1367 / bank_charges_rate)::numeric, 2),
    bank_charges_rate = 40.1367
WHERE date >= '2026-03-01' AND bank_charges_rate <> 40.1367;