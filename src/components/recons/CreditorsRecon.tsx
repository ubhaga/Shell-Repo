import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { useMasterDataStore } from '@/store/masterDataStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { CreditorsTable } from './CreditorsTable';
import { format, startOfMonth, endOfMonth, addDays, getDay, parse } from 'date-fns';
import { toast } from 'sonner';

interface CreditorsReconProps {
  filterMonth: string;
}

export function CreditorsRecon({ filterMonth }: CreditorsReconProps) {
  const { managerEntries } = useCashupStore();
  const { eftSuppliers } = useMasterDataStore();

  // Load bank lines for CR payments
  const [bankLines, setBankLines] = useState<{ amount: number; description: string; transaction_date: string }[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  const [editingOB, setEditingOB] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [bankRes, obRes] = await Promise.all([
      supabase.from('bank_statement_lines').select('amount, description, transaction_date').eq('month', filterMonth),
      supabase.from('creditor_opening_balances').select('*').eq('month', filterMonth),
    ]);
    setBankLines((bankRes.data ?? []) as typeof bankLines);
    const obMap: Record<string, number> = {};
    ((obRes.data ?? []) as { supplier: string; amount: number }[]).forEach(r => {
      obMap[r.supplier] = Number(r.amount);
    });
    setOpeningBalances(obMap);
    setEditingOB({});
  }, [filterMonth]);

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
  const isFuelCreditor = (s: string) => FUEL_CREDITORS.some(fc => fc.toUpperCase() === s.toUpperCase());
  const allSuppliers = [...eftSuppliers].filter(s => s.toUpperCase() !== 'DAWN CONSULTANTS').sort();
  const suppliers = allSuppliers.filter(s => !isFuelCreditor(s));
  const fuelSuppliers = allSuppliers.filter(s => isFuelCreditor(s));

  // EFT invoices from manager daily entries for this month
  const monthManagers = managerEntries.filter(e => e.date.startsWith(filterMonth));

  // Parse bank payment descriptions and map them to EFT suppliers
  const normalizeName = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  const supplierByNormalized = new Map(
    suppliers.map((supplier) => [normalizeName(supplier), supplier])
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

  // Parse bank line date (DD/MM/YYYY format)
  const parseBankDate = (dateStr: string): Date | null => {
    try {
      return parse(dateStr, 'dd/MM/yyyy', new Date());
    } catch { return null; }
  };

  // Build weekly data per supplier
  type WeekData = { invoices: number; payments: number };
  const supplierWeekly: Record<string, WeekData[]> = {};

  [...suppliers, ...fuelSuppliers].forEach(supplier => {
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

    // Deduct bank CR payments
    bankLines.forEach(line => {
      const matched = matchSupplier(line.description);
      if (matched !== supplier) return;
      const lineDate = parseBankDate(line.transaction_date);
      if (!lineDate) return;
      const paymentAmount = Math.abs(line.amount);
      const weekIdx = sundays.findIndex(sun => lineDate <= sun);
      const idx = weekIdx >= 0 ? weekIdx : sundays.length - 1;
      weeks[idx].payments += paymentAmount;
    });

    supplierWeekly[supplier] = weeks;
  });

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
      const ob = openingBalances[s] ?? 0;
      return ob !== 0 || weeks.some(w => w.invoices > 0 || w.payments > 0);
    });
    const inactiveSuppliers = supplierList.filter(s => !activeSuppliers.includes(s));

    return <CreditorsTable
      title={title}
      activeSuppliers={activeSuppliers}
      inactiveSuppliers={inactiveSuppliers}
      supplierWeekly={supplierWeekly}
      openingBalances={openingBalances}
      editingOB={editingOB}
      setEditingOB={setEditingOB}
      weekLabels={weekLabels}
      sundays={sundays}
    />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        {hasEdits && (
          <Button size="sm" onClick={handleSaveOB} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" />Save Opening Balances
          </Button>
        )}
      </div>
      {renderTable(`Creditors Reconciliation — ${format(monthStart, 'MMMM yyyy')}`, suppliers)}
      {fuelSuppliers.length > 0 && renderTable(`Fuel Creditors — ${format(monthStart, 'MMMM yyyy')}`, fuelSuppliers)}
    </div>
  );
}
