import React, { useState, useEffect, useCallback } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { useMasterDataStore } from '@/store/masterDataStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
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

  const suppliers = [...eftSuppliers].sort();

  // EFT invoices from manager daily entries for this month
  const monthManagers = managerEntries.filter(e => e.date.startsWith(filterMonth));

  // Parse bank CR payments: lines starting with "CR " followed by supplier name
  // Match bank description to supplier (case-insensitive partial match)
  const matchSupplier = (desc: string): string | null => {
    const upper = desc.toUpperCase().trim();
    if (!upper.startsWith('CR ')) return null;
    const crName = upper.slice(3).trim();
    for (const s of suppliers) {
      const sUpper = s.toUpperCase();
      // Match either direction: bank may abbreviate supplier name or vice versa
      if (crName.startsWith(sUpper) || sUpper.startsWith(crName)) return s;
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

  suppliers.forEach(supplier => {
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
      // Amount is negative in bank (it's a debit from the bank = payment to supplier)
      // CR lines are typically negative amounts
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

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <h3 className="font-semibold text-sm">
          Creditors Reconciliation — {format(monthStart, 'MMMM yyyy')}
        </h3>
        {hasEdits && (
          <Button size="sm" onClick={handleSaveOB} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" />Save Opening Balances
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-muted z-10 min-w-[120px]">Supplier</TableHead>
              <TableHead className="text-right min-w-[100px]">Opening Bal</TableHead>
              {weekLabels.map((label, i) => (
                <React.Fragment key={i}>
                  <TableHead className="text-right min-w-[90px] text-xs text-green-600">+ Inv</TableHead>
                  <TableHead className="text-right min-w-[90px] text-xs text-red-600">− Paid</TableHead>
                  <TableHead className="text-right min-w-[100px] font-semibold">{label}</TableHead>
                </React.Fragment>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map(supplier => {
              const ob = editingOB[supplier] !== undefined
                ? parseFloat(editingOB[supplier]) || 0
                : (openingBalances[supplier] ?? 0);
              const weeks = supplierWeekly[supplier];
              let runningBalance = ob;

              return (
                <TableRow key={supplier}>
                  <TableCell className="sticky left-0 bg-card z-10 text-xs font-medium whitespace-nowrap">
                    {supplier}
                  </TableCell>
                  <TableCell className="text-right p-1">
                    <Input
                      type="number"
                      className="w-24 text-right text-xs h-7"
                      value={editingOB[supplier] ?? (openingBalances[supplier] ?? '')}
                      onChange={e => setEditingOB(prev => ({ ...prev, [supplier]: e.target.value }))}
                    />
                  </TableCell>
                  {weeks.map((week, wi) => {
                    runningBalance = runningBalance + week.invoices - week.payments;
                    return (
                      <React.Fragment key={wi}>
                        <TableCell className="text-right text-xs">
                          {week.invoices > 0 ? <CurrencyDisplay value={week.invoices} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {week.payments > 0 ? <span className="text-red-600"><CurrencyDisplay value={week.payments} /></span> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          <CurrencyDisplay value={runningBalance} />
                        </TableCell>
                      </React.Fragment>
                    );
                  })}
                </TableRow>
              );
            })}
            {/* Totals row */}
            <TableRow className="bg-secondary font-semibold">
              <TableCell className="sticky left-0 bg-secondary z-10 text-xs">TOTAL</TableCell>
              <TableCell className="text-right text-xs">
                <CurrencyDisplay value={suppliers.reduce((s, sup) => s + (openingBalances[sup] ?? 0), 0)} highlight />
              </TableCell>
              {sundays.map((_, wi) => {
                const totalInv = suppliers.reduce((s, sup) => s + supplierWeekly[sup][wi].invoices, 0);
                const totalPay = suppliers.reduce((s, sup) => s + supplierWeekly[sup][wi].payments, 0);
                // Running total balance
                let totalBal = 0;
                suppliers.forEach(sup => {
                  let bal = openingBalances[sup] ?? 0;
                  for (let w = 0; w <= wi; w++) {
                    bal += supplierWeekly[sup][w].invoices - supplierWeekly[sup][w].payments;
                  }
                  totalBal += bal;
                });
                return (
                  <React.Fragment key={wi}>
                    <TableCell className="text-right text-xs"><CurrencyDisplay value={totalInv} highlight /></TableCell>
                    <TableCell className="text-right text-xs text-red-600"><CurrencyDisplay value={totalPay} /></TableCell>
                    <TableCell className="text-right text-xs font-bold"><CurrencyDisplay value={totalBal} highlight /></TableCell>
                  </React.Fragment>
                );
              })}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
