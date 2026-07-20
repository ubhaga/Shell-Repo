import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { useMasterDataStore } from '@/store/masterDataStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, Download } from 'lucide-react';
import { CreditorsTable } from './CreditorsTable';
import { format, startOfMonth, endOfMonth, addDays, getDay } from 'date-fns';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/csvExport';
import { parseBankStatementDateToDate } from '@/lib/bankStatementDate';
import { useBankAllocations } from '@/hooks/useBankAllocations';

interface CreditorsReconProps {
  filterMonth: string;
}

export function CreditorsRecon({ filterMonth }: CreditorsReconProps) {
  const { managerEntries } = useCashupStore();
  const { eftSuppliers, directlyExpensedSuppliers: directlyExpensedFromSettings } = useMasterDataStore();
  const { allocations: bankAllocations } = useBankAllocations(filterMonth);

  // Load bank lines for CR payments (now includes id for allocation matching)
  const [bankLines, setBankLines] = useState<{ id: string; amount: number; description: string; transaction_date: string }[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  const [editingOB, setEditingOB] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [priorBankLinesByMonth, setPriorBankLinesByMonth] = useState<Record<string, typeof bankLines>>({});
  const [priorAllocationsByMonth, setPriorAllocationsByMonth] = useState<Record<string, { bank_line_id: string; recon_type: string; target_name: string }[]>>({});
  const [priorOpeningByMonth, setPriorOpeningByMonth] = useState<Record<string, Record<string, number>>>({});
  const [seedOB, setSeedOB] = useState<Record<string, number>>({});

  const isFirstMonth = filterMonth <= '2026-03';

  // Build list of months from March 2026 up to (but not including) filterMonth
  const priorMonths = useMemo(() => {
    const months: string[] = [];
    let d = new Date('2026-03-01');
    const end = new Date(filterMonth + '-01');
    while (d < end) {
      months.push(format(d, 'yyyy-MM'));
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    return months;
  }, [filterMonth]);

  const loadData = useCallback(async () => {
    const [bankRes, obRes] = await Promise.all([
      supabase.from('bank_statement_lines').select('id, amount, description, transaction_date').eq('month', filterMonth),
      supabase.from('creditor_opening_balances').select('*').eq('month', filterMonth),
    ]);

    setBankLines((bankRes.data ?? []) as typeof bankLines);
    const obMap: Record<string, number> = {};
    ((obRes.data ?? []) as { supplier: string; amount: number }[]).forEach(r => {
      obMap[r.supplier] = Number(r.amount);
    });
    setOpeningBalances(obMap);
    setEditingOB({});

    // Load seed OB (March 2026) always
    if (filterMonth !== '2026-03') {
      const { data: seedRes } = await supabase.from('creditor_opening_balances').select('*').eq('month', '2026-03');
      const seedMap: Record<string, number> = {};
      ((seedRes ?? []) as { supplier: string; amount: number }[]).forEach(r => {
        seedMap[r.supplier] = Number(r.amount);
      });
      setSeedOB(seedMap);
    } else {
      setSeedOB({});
    }

    // Load bank lines + allocations for every prior month (chain)
    if (priorMonths.length > 0) {
      const [bankAll, allocAll] = await Promise.all([
        supabase.from('bank_statement_lines').select('id, amount, description, transaction_date, month').in('month', priorMonths),
        supabase.from('bank_line_allocations').select('bank_line_id, recon_type, target_name, month').in('month', priorMonths),
      ]);
      const bankByMonth: Record<string, typeof bankLines> = {};
      ((bankAll.data ?? []) as (typeof bankLines[number] & { month: string })[]).forEach(l => {
        if (!bankByMonth[l.month]) bankByMonth[l.month] = [];
        bankByMonth[l.month].push({ id: l.id, amount: l.amount, description: l.description, transaction_date: l.transaction_date });
      });
      setPriorBankLinesByMonth(bankByMonth);
      const allocByMonth: Record<string, { bank_line_id: string; recon_type: string; target_name: string }[]> = {};
      ((allocAll.data ?? []) as { bank_line_id: string; recon_type: string; target_name: string; month: string }[]).forEach(a => {
        if (!allocByMonth[a.month]) allocByMonth[a.month] = [];
        allocByMonth[a.month].push(a);
      });
      setPriorAllocationsByMonth(allocByMonth);
    } else {
      setPriorBankLinesByMonth({});
      setPriorAllocationsByMonth({});
    }
  }, [filterMonth, priorMonths]);

  useEffect(() => { loadData(); }, [loadData]);

  // Compute week-ending Sundays for the month
  const monthStart = startOfMonth(new Date(filterMonth + '-01'));
  const monthEnd = endOfMonth(monthStart);
  const sundays: Date[] = [];
  let d = monthStart;
  while (d <= monthEnd) {
    if (getDay(d) === 0) sundays.push(d);
    d = addDays(d, 1);
  }
  // If month doesn't end on Sunday, add monthEnd as final period
  if (getDay(monthEnd) !== 0) sundays.push(monthEnd);

  const FUEL_CREDITORS = ['Shell Downstream', 'F2K'];
  const canon = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();
  const isFuelCreditor = (s: string) => FUEL_CREDITORS.some(fc => canon(fc) === canon(s));
  const isDirectlyExpensed = (s: string) =>
    directlyExpensedFromSettings.some(dc => canon(dc) === canon(s));
  // Merge suppliers from EFT list + directly-expensed settings list so directly-expensed
  // items still appear in the recon even if removed from the EFT supplier list.
  // Deduplicate case/whitespace variants (e.g. "Status Hygiene" vs "Status  Hygiene").
  const mergedSuppliersRaw = [...eftSuppliers, ...directlyExpensedFromSettings];
  const seenCanon = new Set<string>();
  const mergedSuppliers: string[] = [];
  for (const s of mergedSuppliersRaw) {
    const c = canon(s);
    if (seenCanon.has(c)) continue;
    seenCanon.add(c);
    // Prefer the directly-expensed spelling when both exist
    const preferred = directlyExpensedFromSettings.find(d => canon(d) === c) ?? s;
    mergedSuppliers.push(preferred);
  }
  const allSuppliers = mergedSuppliers.sort();
  const suppliers = allSuppliers.filter(s => !isFuelCreditor(s) && !isDirectlyExpensed(s));
  const directlyExpensedSuppliers = allSuppliers.filter(s => isDirectlyExpensed(s));
  const fuelSuppliers = allSuppliers.filter(s => isFuelCreditor(s));


  // EFT invoices from manager daily entries for this month
  const monthManagers = managerEntries.filter(e => e.date.startsWith(filterMonth));

  // Get cashups for Deep Frozen CC payments
  const { cashups } = useCashupStore();

  // Parse bank payment descriptions and map them to EFT suppliers
  const normalizeName = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  const supplierByNormalized = new Map(
    [...suppliers, ...directlyExpensedSuppliers, ...fuelSuppliers].map((supplier) => [normalizeName(supplier), supplier])
  );


  const resolveSupplier = (preferredNames: string[]): string | null => {
    for (const name of preferredNames) {
      const found = supplierByNormalized.get(normalizeName(name));
      if (found) return found;
    }
    return null;
  };

  const matchSupplier = (desc: string): string | null => {
    const raw = desc.toUpperCase().trim();
    const normalized = normalizeName(desc);

    const aliasRules: Array<{ patterns: RegExp[]; suppliers: string[] }> = [
      { patterns: [/\bCR\s+WICKED\s+CONV(?:ENIENCE)?\b/, /\bWICKED\s+CONV\b/], suppliers: ['Wicked Convenience'] },
      { patterns: [/\bCR\s+STATUS\s+HYGIENE\b/, /\bSTATUS\s+HYGIENE\b/], suppliers: ['Status Hygiene'] },
      { patterns: [/\bCR\s+RFP\b/, /\bCR\s+FROZEN\s+SOLN\b/], suppliers: ['RFP'] },
      { patterns: [/\bSS898\b/, /\bSS998\b/], suppliers: ['Clippa Sales'] },
      { patterns: [/\bSHELL\s+F2K\b/, /\bF2K\b/], suppliers: ['F2K'] },
      { patterns: [/\bSHELL\s*DOWN\d+\b/, /\bSHELL\s+DOWNSTREAM\b/], suppliers: ['Shell Downstream'] },
    ];

    for (const rule of aliasRules) {
      if (rule.patterns.some((pattern) => pattern.test(raw))) {
        const supplier = resolveSupplier(rule.suppliers);
        if (supplier) return supplier;
      }
    }

    const crMatch = raw.match(/\bCR\s+(.+)$/);
    const candidate = crMatch ? normalizeName(crMatch[1]) : normalized;

    for (const supplier of suppliers) {
      const supplierNormalized = normalizeName(supplier);
      if (candidate.startsWith(supplierNormalized) || supplierNormalized.startsWith(candidate)) {
        return supplier;
      }
    }

    return null;
  };

  const parseBankDate = (dateStr: string): Date | null => parseBankStatementDateToDate(dateStr);

  // Build weekly data per supplier
  type WeekData = { invoices: number; payments: number };
  const supplierWeekly: Record<string, WeekData[]> = {};

  [...suppliers, ...directlyExpensedSuppliers, ...fuelSuppliers].forEach(supplier => {
    const weeks: WeekData[] = sundays.map(() => ({ invoices: 0, payments: 0 }));

    // Add EFT invoices
    monthManagers.forEach(entry => {
      const entryDate = new Date(entry.date);
      entry.eftInvoices.forEach(inv => {
        if (inv.supplier === supplier) {
          const weekIdx = sundays.findIndex(sun => entryDate <= sun);
          const idx = weekIdx >= 0 ? weekIdx : sundays.length - 1;
          weeks[idx].invoices += inv.inclusive;
        }
      });
    });

    // Deduct bank CR payments (check manual allocation first, then regex)
    bankLines.forEach(line => {
      // Check manual allocation first
      const allocation = bankAllocations.find(a => a.bank_line_id === line.id && a.recon_type === 'creditor');
      const rawMatched = allocation ? allocation.target_name : matchSupplier(line.description);
      // Resolve to the canonical supplier name (handles whitespace/case variants in stored allocations)
      const matched = rawMatched ? (supplierByNormalized.get(normalizeName(rawMatched)) ?? rawMatched) : null;
      if (matched !== supplier) return;
      const lineDate = parseBankDate(line.transaction_date);
      if (!lineDate) return;
      const paymentAmount = Math.abs(line.amount);
      const weekIdx = sundays.findIndex(sun => lineDate <= sun);
      const idx = weekIdx >= 0 ? weekIdx : sundays.length - 1;
      weeks[idx].payments += paymentAmount;
    });

    // Add Deep Frozen paid in CC from manager daily as payments for "Deep frozen" supplier
    const isDeepFrozen = supplier.toLowerCase().replace(/\s+/g, '') === 'deepfrozen';
    if (isDeepFrozen) {
      monthManagers.forEach(entry => {
        const dfAmount = entry.deepFrozenCC ?? 0;
        if (dfAmount > 0) {
          const entryDate = new Date(entry.date);
          const weekIdx = sundays.findIndex(sun => entryDate <= sun);
          const idx = weekIdx >= 0 ? weekIdx : sundays.length - 1;
          weeks[idx].payments += dfAmount;
        }
      });
    }

    supplierWeekly[supplier] = weeks;
  });

  // Compute effective opening balances by walking chain from March 2026 forward.
  // Each month's closing = OB + invoices - payments (regex-matched + manually allocated).
  const effectiveOB = useMemo(() => {
    if (isFirstMonth) return { ...openingBalances };

    const allSup = [...suppliers, ...directlyExpensedSuppliers, ...fuelSuppliers];
    // Running balance per supplier — start from seed (March 2026) stored OB
    const running: Record<string, number> = {};
    allSup.forEach(s => { running[s] = seedOB[s] ?? 0; });

    for (const m of priorMonths) {
      const monthManagersM = managerEntries.filter(e => e.date.startsWith(m));
      const bankM = priorBankLinesByMonth[m] ?? [];
      const allocM = priorAllocationsByMonth[m] ?? [];

      allSup.forEach(supplier => {
        let inv = 0;
        let pay = 0;
        monthManagersM.forEach(entry => {
          entry.eftInvoices.forEach(i => {
            if (i.supplier === supplier) inv += i.inclusive;
          });
        });
        bankM.forEach(line => {
          const alloc = allocM.find(a => a.bank_line_id === line.id && a.recon_type === 'creditor');
          const rawMatched = alloc ? alloc.target_name : matchSupplier(line.description);
          const matched = rawMatched ? (supplierByNormalized.get(normalizeName(rawMatched)) ?? rawMatched) : null;
          if (matched !== supplier) return;
          pay += Math.abs(line.amount);
        });
        // Deep frozen CC counts as payment for "Deep frozen"
        if (supplier.toLowerCase().replace(/\s+/g, '') === 'deepfrozen') {
          monthManagersM.forEach(entry => { pay += entry.deepFrozenCC ?? 0; });
        }
        running[supplier] = running[supplier] + inv - pay;
      });
    }

    // Manual override for this month takes precedence
    const result: Record<string, number> = {};
    allSup.forEach(s => {
      result[s] = openingBalances[s] !== undefined ? openingBalances[s] : running[s];
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingBalances, isFirstMonth, seedOB, priorMonths, priorBankLinesByMonth, priorAllocationsByMonth, managerEntries, suppliers, directlyExpensedSuppliers, fuelSuppliers]);

  // Save opening balances
  const handleSaveOB = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(editingOB);
      for (const [supplier, valStr] of entries) {
        const amount = parseFloat(valStr) || 0;
        await supabase.from('creditor_opening_balances').upsert(
          { month: filterMonth, supplier, amount } as never,
          { onConflict: 'month,supplier' }
        );
        setOpeningBalances(prev => ({ ...prev, [supplier]: amount }));
      }
      setEditingOB({});
      toast.success('Opening balances saved');
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  const hasEdits = Object.keys(editingOB).length > 0;

  // Format sunday labels
  const weekLabels = sundays.map((sun, i) =>
    i === sundays.length - 1 && getDay(monthEnd) !== 0
      ? format(sun, 'dd MMM') + ' (EOM)'
      : format(sun, 'dd MMM')
  );

  const renderTable = (title: string, supplierList: string[]) => {
    const activeSuppliers = supplierList.filter(s => {
      const weeks = supplierWeekly[s];
      const ob = effectiveOB[s] ?? 0;
      return ob !== 0 || weeks.some(w => w.invoices > 0 || w.payments > 0);
    });
    const inactiveSuppliers = supplierList.filter(s => !activeSuppliers.includes(s));

    return <CreditorsTable
      title={title}
      activeSuppliers={activeSuppliers}
      inactiveSuppliers={inactiveSuppliers}
      supplierWeekly={supplierWeekly}
      openingBalances={effectiveOB}
      editingOB={editingOB}
      setEditingOB={setEditingOB}
      weekLabels={weekLabels}
      sundays={sundays}
      readOnlyOB={!isFirstMonth}
    />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => {
          const allSup = [...suppliers, ...directlyExpensedSuppliers, ...fuelSuppliers];
          const headers = ['Supplier', 'Opening Balance', ...weekLabels.flatMap(l => [`Invoices (${l})`, `Payments (${l})`, `Balance (${l})`])];
          const csvRows = allSup.map(s => {
            const ob = effectiveOB[s] ?? 0;
            let bal = ob;
            const weeks = supplierWeekly[s];
            const weekCols = weeks.flatMap(w => {
              bal = bal + w.invoices - w.payments;
              return [w.invoices, w.payments, bal];
            });
            return [s, ob, ...weekCols] as (string | number)[];
          });
          downloadCsv(headers, csvRows, `creditors-recon-${filterMonth}.csv`);
        }}>
          <Download className="h-3.5 w-3.5 mr-1" />Export CSV
        </Button>
        {hasEdits && (
          <Button size="sm" onClick={handleSaveOB} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" />Save Opening Balances
          </Button>
        )}
      </div>
      {renderTable(`Creditors Reconciliation — ${format(monthStart, 'MMMM yyyy')}`, suppliers)}
      {directlyExpensedSuppliers.length > 0 && renderTable(`Directly Expensed Creditors — ${format(monthStart, 'MMMM yyyy')}`, directlyExpensedSuppliers)}
      {fuelSuppliers.length > 0 && renderTable(`Fuel Creditors — ${format(monthStart, 'MMMM yyyy')}`, fuelSuppliers)}
    </div>
  );
}
