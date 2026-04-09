import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay, CurrencyInput } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

interface DebtorsReconProps {
  filterMonth: string;
}

// Mapping of bank statement description patterns to account names
const BANK_PAYMENT_RULES: { pattern: RegExp; account: string }[] = [
  { pattern: /ST TERESA/i, account: 'St Theresas' },
  { pattern: /OSIRIS.*LANCASTER|LANCASTER.*PHARMACY/i, account: 'Lancaster Pharmacy' },
  { pattern: /FNB OB.*HPT|HYDE PARK TOYOTA/i, account: 'Hyde Park Toyota' },
  { pattern: /CR BP ZOO.*ISUZU/i, account: 'Isuzu bakkie' },
  { pattern: /CR BP ZOO.*MAHINDRA|BP ZOO MAHINDRA/i, account: 'Mahindra' },
  { pattern: /CR BP ZOO.*LAKE.*DSL|BP ZOO LAKE DSL/i, account: 'Bp Zoolake' },
];

// The debtors we track (excluding Generator and Shop Expense which are JE3 writeoffs)
const DEBTOR_ACCOUNTS = [
  'Mahindra',
  'Lancaster Pharmacy',
  'Hyde Park Toyota',
  'Hltc',
  'St Theresas',
  'Sayinile',
  'Red cross',
  'Umesh',
  'Isuzu bakkie',
  'Bp Zoolake',
  'Bp Zoolake Account Customer',
  'Shell Parkhurst',
  'House tech',
  'Moses bpzl',
];

// JE3 writeoff accounts — these are treated as adjustments (reducing debtor balance)
const JE3_WRITEOFF_ACCOUNTS = ['Generator', 'Shop Expense'];

export function DebtorsRecon({ filterMonth }: DebtorsReconProps) {
  const { cashups } = useCashupStore();

  const [bankLines, setBankLines] = useState<{ amount: number; description: string; transaction_date: string }[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  const [editingOB, setEditingOB] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const isFirstMonth = filterMonth === '2026-03';

  // Previous month for rolling balances
  const prevMonth = useMemo(() => {
    const d = new Date(filterMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, [filterMonth]);

  const loadData = useCallback(async () => {
    const [bankRes, obRes] = await Promise.all([
      supabase.from('bank_statement_lines').select('amount, description, transaction_date').eq('month', filterMonth),
      supabase.from('creditor_opening_balances').select('*').eq('month', filterMonth),
    ]);
    setBankLines((bankRes.data ?? []) as typeof bankLines);
    // Re-use creditor_opening_balances table for debtors too (with "debtor:" prefix)
    const obMap: Record<string, number> = {};
    ((obRes.data ?? []) as { supplier: string; amount: number }[]).forEach(r => {
      if (r.supplier.startsWith('debtor:')) {
        obMap[r.supplier.replace('debtor:', '')] = Number(r.amount);
      }
    });
    setOpeningBalances(obMap);
    setEditingOB({});
  }, [filterMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // Purchases: sum of account entries from cashups for each debtor
  const purchases = useMemo(() => {
    const monthlyCashups = cashups.filter(c => c.month === filterMonth);
    const totals: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(a => { totals[a] = 0; });
    for (const c of monthlyCashups) {
      for (const a of c.shop.accounts ?? []) {
        if (totals[a.name] !== undefined) totals[a.name] += a.amount;
      }
      for (const a of c.opt.accounts ?? []) {
        if (totals[a.name] !== undefined) totals[a.name] += a.amount;
      }
    }
    return totals;
  }, [filterMonth, cashups]);

  // Bank payments mapped to debtors
  const bankPayments = useMemo(() => {
    const totals: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(a => { totals[a] = 0; });
    for (const line of bankLines) {
      if (line.amount <= 0) continue; // payments are credits (positive amounts)
      for (const rule of BANK_PAYMENT_RULES) {
        if (rule.pattern.test(line.description)) {
          totals[rule.account] = (totals[rule.account] || 0) + line.amount;
          break;
        }
      }
    }
    return totals;
  }, [bankLines]);

  // ROA payments allocated per debtor using seqNo as debtor reference
  const roaPerDebtor = useMemo(() => {
    const monthlyCashups = cashups.filter(c => c.month === filterMonth);
    const totals: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(a => { totals[a] = 0; });
    for (const c of monthlyCashups) {
      for (const r of c.shop.receipts ?? []) {
        if (r.type === 'Debtors Received on Account ROA' && r.amount > 0) {
          // seqNo contains debtor name reference
          const ref = (r.seqNo || '').trim();
          // Match seqNo to a debtor account (case-insensitive)
          const matched = DEBTOR_ACCOUNTS.find(a => a.toLowerCase() === ref.toLowerCase());
          if (matched) {
            totals[matched] = (totals[matched] || 0) + r.amount;
          }
        }
      }
    }
    return totals;
  }, [filterMonth, cashups]);

  // JE3 adjustments (writeoffs treated as payments)
  const je3Adjustments = useMemo(() => {
    const monthlyCashups = cashups.filter(c => c.month === filterMonth);
    const totals: Record<string, number> = {};
    JE3_WRITEOFF_ACCOUNTS.forEach(a => { totals[a] = 0; });
    for (const c of monthlyCashups) {
      for (const a of c.shop.accounts ?? []) {
        if (totals[a.name] !== undefined) totals[a.name] += a.amount;
      }
      for (const a of c.opt.accounts ?? []) {
        if (totals[a.name] !== undefined) totals[a.name] += a.amount;
      }
    }
    return totals;
  }, [filterMonth, cashups]);

  const totalJe3 = Object.values(je3Adjustments).reduce((s, v) => s + v, 0);

  // Build rows — JE3 writeoffs distributed as adjustments per debtor
  // Generator and Shop Expense are general writeoffs, spread as a single total adjustment row
  const rows = DEBTOR_ACCOUNTS.map(name => {
    const ob = openingBalances[name] ?? editingOB[name] ?? 0;
    const purchase = purchases[name] || 0;
    const bankPmt = (bankPayments[name] || 0) + (roaPerDebtor[name] || 0);
    const adjustment = 0; // individual debtors don't have JE3 adjustments
    const closing = ob + purchase - bankPmt - adjustment;
    return { name, ob, purchase, bankPmt, adjustment, closing };
  });

  // Add JE3 writeoff accounts as adjustment rows
  const je3Rows = JE3_WRITEOFF_ACCOUNTS.map(name => {
    const amount = je3Adjustments[name] || 0;
    return { name, ob: 0, purchase: 0, bankPmt: 0, adjustment: amount, closing: -amount };
  });

  const allRows = [...rows, ...je3Rows.filter(r => r.adjustment > 0)];

  const totals = allRows.reduce(
    (acc, r) => ({
      ob: acc.ob + r.ob,
      purchase: acc.purchase + r.purchase,
      bankPmt: acc.bankPmt + r.bankPmt,
      adjustment: acc.adjustment + r.adjustment,
      closing: acc.closing + r.closing,
    }),
    { ob: 0, purchase: 0, bankPmt: 0, adjustment: 0, closing: 0 }
  );

  const handleSaveOB = async () => {
    setSaving(true);
    try {
      for (const [name, amount] of Object.entries(editingOB)) {
        const supplier = `debtor:${name}`;
        const { data: existing } = await supabase
          .from('creditor_opening_balances')
          .select('id')
          .eq('month', filterMonth)
          .eq('supplier', supplier);
        if (existing && existing.length > 0) {
          await supabase.from('creditor_opening_balances').update({ amount } as never).eq('id', existing[0].id);
        } else {
          await supabase.from('creditor_opening_balances').insert({ month: filterMonth, supplier, amount } as never);
        }
      }
      toast.success('Opening balances saved');
      loadData();
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  const hasEdits = Object.keys(editingOB).length > 0;

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <h3 className="font-semibold text-sm">Debtors Reconciliation — {filterMonth}</h3>
        {isFirstMonth && hasEdits && (
          <Button size="sm" variant="outline" onClick={handleSaveOB} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" />{saving ? 'Saving...' : 'Save OB'}
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Debtor</TableHead>
            <TableHead className="text-xs text-right">Opening Balance</TableHead>
            <TableHead className="text-xs text-right">Purchases</TableHead>
            <TableHead className="text-xs text-right">Payments</TableHead>
            <TableHead className="text-xs text-right">Adjustments (JE3)</TableHead>
            <TableHead className="text-xs text-right">Closing Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.name}>
              <TableCell className="text-sm">{r.name}</TableCell>
              <TableCell className="text-right">
                {isFirstMonth ? (
                  <CurrencyInput
                    value={editingOB[r.name] ?? r.ob}
                    onChange={v => setEditingOB(prev => ({ ...prev, [r.name]: v }))}
                    className="w-28 text-right text-xs"
                  />
                ) : (
                  <CurrencyDisplay value={r.ob} />
                )}
              </TableCell>
              <TableCell className="text-right"><CurrencyDisplay value={r.purchase} /></TableCell>
              <TableCell className="text-right"><CurrencyDisplay value={r.bankPmt} /></TableCell>
              <TableCell className="text-right"><CurrencyDisplay value={r.adjustment} /></TableCell>
              <TableCell className="text-right font-semibold"><CurrencyDisplay value={r.closing} /></TableCell>
            </TableRow>
          ))}
          {/* JE3 Writeoff rows */}
          {je3Rows.filter(r => r.adjustment > 0).map(r => (
            <TableRow key={r.name} className="text-muted-foreground">
              <TableCell className="text-sm">{r.name} (JE3)</TableCell>
              <TableCell className="text-right"><CurrencyDisplay value={0} /></TableCell>
              <TableCell className="text-right"><CurrencyDisplay value={0} /></TableCell>
              <TableCell className="text-right"><CurrencyDisplay value={0} /></TableCell>
              <TableCell className="text-right"><CurrencyDisplay value={r.adjustment} /></TableCell>
              <TableCell className="text-right font-semibold"><CurrencyDisplay value={r.closing} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold text-sm">Net Debtors Closing Balance</TableCell>
            <TableCell className="text-right"><CurrencyDisplay value={totals.ob} highlight /></TableCell>
            <TableCell className="text-right"><CurrencyDisplay value={totals.purchase} highlight /></TableCell>
            <TableCell className="text-right"><CurrencyDisplay value={totals.bankPmt} highlight /></TableCell>
            <TableCell className="text-right"><CurrencyDisplay value={totals.adjustment} highlight /></TableCell>
            <TableCell className="text-right"><CurrencyDisplay value={totals.closing} highlight /></TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}