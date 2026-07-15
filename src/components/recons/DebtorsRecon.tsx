import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { useMasterDataStore } from '@/store/masterDataStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay, CurrencyInput } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Save, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '@/lib/csvExport';
import { useBankAllocations } from '@/hooks/useBankAllocations';
import { acctSortValue } from '@/components/settings/MasterDataSettings';

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

// Fallback debtors (used to seed the master-data list on first run and to guarantee
// accounts referenced by BANK_PAYMENT_RULES / JE3 always appear even if removed from settings)
const FALLBACK_DEBTOR_ACCOUNTS = [
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
  'Generator',
  'Shop Expense',
];

// JE3 writeoff accounts — their purchases are also shown as adjustments (reducing closing balance)
const JE3_WRITEOFF_ACCOUNTS = ['Generator', 'Shop Expense', 'Umesh'];

export function DebtorsRecon({ filterMonth }: DebtorsReconProps) {
  const { cashups } = useCashupStore();
  const { allocations: bankAllocations } = useBankAllocations(filterMonth);
  const masterAccounts = useMasterDataStore(s => s.accounts);
  const accountNumbers = useMasterDataStore(s => s.accountNumbers);

  // Always display every debtor from Master Data settings, plus any fallback
  // debtors that bank/JE3 rules still reference (so nothing silently disappears).
  // Sort: numeric A/c No first (ascending), then alphabetically by name.
  const DEBTOR_ACCOUNTS = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    [...masterAccounts, ...FALLBACK_DEBTOR_ACCOUNTS].forEach(name => {
      const key = name.trim();
      if (!key) return;
      const lower = key.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      out.push(key);
    });
    return out.sort((a, b) => {
      const va = acctSortValue(accountNumbers[a]);
      const vb = acctSortValue(accountNumbers[b]);
      const aNum = !Number.isNaN(va);
      const bNum = !Number.isNaN(vb);
      if (aNum && bNum) return va - vb || a.localeCompare(b);
      if (aNum) return -1;
      if (bNum) return 1;
      return a.localeCompare(b);
    });
  }, [masterAccounts, accountNumbers]);

  type BankLine = { id: string; amount: number; description: string; transaction_date: string; month: string };
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  // History for all months from FIRST_MONTH up to (but not including) filterMonth
  const [historyBankLines, setHistoryBankLines] = useState<BankLine[]>([]);
  const [historyOpeningBalances, setHistoryOpeningBalances] = useState<Record<string, Record<string, number>>>({});
  const [historyAllocations, setHistoryAllocations] = useState<{ bank_line_id: string; recon_type: string; target_name: string }[]>([]);
  const [editingOB, setEditingOB] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const FIRST_MONTH = '2026-03';
  const isFirstMonth = filterMonth === FIRST_MONTH;

  // All prior months from FIRST_MONTH up to (but not including) filterMonth
  const priorMonths = useMemo(() => {
    const out: string[] = [];
    const start = new Date(FIRST_MONTH + '-01');
    const end = new Date(filterMonth + '-01');
    const cur = new Date(start);
    while (cur < end) {
      out.push(cur.toISOString().slice(0, 7));
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }, [filterMonth]);

  const loadData = useCallback(async () => {
    const [bankRes, obRes] = await Promise.all([
      supabase.from('bank_statement_lines').select('id, amount, description, transaction_date, month').eq('month', filterMonth),
      supabase.from('creditor_opening_balances').select('*').eq('month', filterMonth),
    ]);
    setBankLines((bankRes.data ?? []) as BankLine[]);
    const obMap: Record<string, number> = {};
    ((obRes.data ?? []) as { supplier: string; amount: number }[]).forEach(r => {
      if (r.supplier.startsWith('debtor:')) {
        obMap[r.supplier.replace('debtor:', '')] = Number(r.amount);
      }
    });
    setOpeningBalances(obMap);
    setEditingOB({});

    if (priorMonths.length > 0) {
      const [histBankRes, histObRes, histAllocRes] = await Promise.all([
        supabase.from('bank_statement_lines').select('id, amount, description, transaction_date, month').in('month', priorMonths),
        supabase.from('creditor_opening_balances').select('*').in('month', priorMonths),
        supabase.from('bank_line_allocations').select('bank_line_id, recon_type, target_name').in('month', priorMonths),
      ]);
      setHistoryBankLines((histBankRes.data ?? []) as BankLine[]);
      setHistoryAllocations((histAllocRes.data ?? []) as { bank_line_id: string; recon_type: string; target_name: string }[]);
      const histOb: Record<string, Record<string, number>> = {};
      ((histObRes.data ?? []) as { month: string; supplier: string; amount: number }[]).forEach(r => {
        if (!r.supplier.startsWith('debtor:')) return;
        const name = r.supplier.replace('debtor:', '');
        (histOb[r.month] ||= {})[name] = Number(r.amount);
      });
      setHistoryOpeningBalances(histOb);
    } else {
      setHistoryBankLines([]);
      setHistoryOpeningBalances({});
      setHistoryAllocations([]);
    }
  }, [filterMonth, priorMonths]);

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

  // Per-debtor purchase line items (date, source, amount)
  const purchaseDetails = useMemo(() => {
    const map: Record<string, { date: string; source: string; amount: number }[]> = {};
    DEBTOR_ACCOUNTS.forEach(a => { map[a] = []; });
    const monthlyCashups = cashups.filter(c => c.month === filterMonth);
    for (const c of monthlyCashups) {
      for (const a of c.shop.accounts ?? []) {
        if (map[a.name] && a.amount) map[a.name].push({ date: c.date, source: 'Shop', amount: a.amount });
      }
      for (const a of c.opt.accounts ?? []) {
        if (map[a.name] && a.amount) map[a.name].push({ date: c.date, source: 'OPT', amount: a.amount });
      }
    }
    Object.values(map).forEach(arr => arr.sort((x, y) => x.date.localeCompare(y.date)));
    return map;
  }, [filterMonth, cashups]);



  // Helpers computing per-debtor totals for any given month
  const purchasesForMonth = useCallback((m: string) => {
    const totals: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(a => { totals[a] = 0; });
    for (const c of cashups.filter(c => c.month === m)) {
      for (const a of c.shop.accounts ?? []) if (totals[a.name] !== undefined) totals[a.name] += a.amount;
      for (const a of c.opt.accounts ?? []) if (totals[a.name] !== undefined) totals[a.name] += a.amount;
    }
    return totals;
  }, [cashups, DEBTOR_ACCOUNTS]);

  const roaForMonth = useCallback((m: string) => {
    const totals: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(a => { totals[a] = 0; });
    for (const c of cashups.filter(c => c.month === m)) {
      for (const r of c.shop.receipts ?? []) {
        if (r.type === 'Debtors Received on Account ROA' && r.amount > 0) {
          const ref = (r.seqNo || '').trim();
          const matched = DEBTOR_ACCOUNTS.find(a => a.toLowerCase() === ref.toLowerCase());
          if (matched) totals[matched] = (totals[matched] || 0) + r.amount;
        }
      }
    }
    return totals;
  }, [cashups, DEBTOR_ACCOUNTS]);

  const bankPaymentsForMonth = useCallback((lines: BankLine[], useAllocations: boolean) => {
    const totals: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(a => { totals[a] = 0; });
    for (const line of lines) {
      if (line.amount <= 0) continue;
      if (useAllocations) {
        const allocation =
          bankAllocations.find(a => a.bank_line_id === line.id && a.recon_type === 'debtor') ??
          historyAllocations.find(a => a.bank_line_id === line.id && a.recon_type === 'debtor');
        if (allocation) {
          totals[allocation.target_name] = (totals[allocation.target_name] || 0) + line.amount;
          continue;
        }
      }
      for (const rule of BANK_PAYMENT_RULES) {
        if (rule.pattern.test(line.description)) {
          totals[rule.account] = (totals[rule.account] || 0) + line.amount;
          break;
        }
      }
    }
    return totals;
  }, [bankAllocations, historyAllocations, DEBTOR_ACCOUNTS]);

  // Bank payments mapped to debtors (current month, honours manual allocations)
  const bankPayments = useMemo(() => bankPaymentsForMonth(bankLines, true), [bankPaymentsForMonth, bankLines]);

  // ROA payments allocated per debtor using seqNo as debtor reference
  const roaPerDebtor = useMemo(() => roaForMonth(filterMonth), [roaForMonth, filterMonth]);

  // Per-debtor payment line items combining bank statement matches and ROA receipts
  const paymentDetails = useMemo(() => {
    const map: Record<string, { date: string; source: string; description: string; amount: number }[]> = {};
    DEBTOR_ACCOUNTS.forEach(a => { map[a] = []; });
    for (const line of bankLines) {
      if (line.amount <= 0) continue;
      let target: string | null = null;
      const allocation = bankAllocations.find(a => a.bank_line_id === line.id && a.recon_type === 'debtor');
      if (allocation) {
        target = allocation.target_name;
      } else {
        for (const rule of BANK_PAYMENT_RULES) {
          if (rule.pattern.test(line.description)) { target = rule.account; break; }
        }
      }
      if (target && map[target]) {
        map[target].push({ date: line.transaction_date, source: 'Bank', description: line.description, amount: line.amount });
      }
    }
    for (const c of cashups.filter(c => c.month === filterMonth)) {
      for (const r of c.shop.receipts ?? []) {
        if (r.type === 'Debtors Received on Account ROA' && r.amount > 0) {
          const ref = (r.seqNo || '').trim();
          const matched = DEBTOR_ACCOUNTS.find(a => a.toLowerCase() === ref.toLowerCase());
          if (matched) {
            map[matched].push({ date: c.date, source: 'ROA', description: `ROA ${ref}`, amount: r.amount });
          }
        }
      }
    }
    Object.values(map).forEach(arr => arr.sort((x, y) => x.date.localeCompare(y.date)));
    return map;
  }, [filterMonth, cashups, bankLines, bankAllocations, DEBTOR_ACCOUNTS]);

  // Effective OB for filterMonth: walk chain from FIRST_MONTH forward.
  // For each month, closing = OB(stored) + purchases - (bank pmts + ROA) - JE3 write-offs
  // Next month's OB = prior closing (unless stored OB exists for that month, then use stored).
  const effectiveOpeningBalances = useMemo(() => {
    if (isFirstMonth) return { ...openingBalances };

    // Start balances = stored OB for FIRST_MONTH
    let balances: Record<string, number> = { ...(historyOpeningBalances[FIRST_MONTH] ?? {}) };

    for (const m of priorMonths) {
      const storedOb = historyOpeningBalances[m];
      const monthOb: Record<string, number> = {};
      DEBTOR_ACCOUNTS.forEach(name => {
        monthOb[name] = storedOb?.[name] ?? balances[name] ?? 0;
      });
      const p = purchasesForMonth(m);
      const monthBankLines = historyBankLines.filter(b => b.month === m);
      const bp = bankPaymentsForMonth(monthBankLines, true);
      const roa = roaForMonth(m);
      const next: Record<string, number> = {};
      DEBTOR_ACCOUNTS.forEach(name => {
        const purchase = p[name] || 0;
        const bankPmt = (bp[name] || 0) + (roa[name] || 0);
        const adj = JE3_WRITEOFF_ACCOUNTS.includes(name) ? purchase : 0;
        next[name] = (monthOb[name] || 0) + purchase - bankPmt - adj;
      });
      balances = next;
    }

    // Allow explicit override via stored OB for filterMonth (rare)
    const out: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(name => {
      out[name] = openingBalances[name] ?? balances[name] ?? 0;
    });
    return out;
  }, [
    isFirstMonth,
    openingBalances,
    historyOpeningBalances,
    historyBankLines,
    priorMonths,
    DEBTOR_ACCOUNTS,
    purchasesForMonth,
    bankPaymentsForMonth,
    roaForMonth,
  ]);


  // Build rows — JE3 accounts get their purchases as adjustments too
  const rows = DEBTOR_ACCOUNTS.map(name => {
    const ob = isFirstMonth
      ? (editingOB[name] ?? effectiveOpeningBalances[name] ?? 0)
      : (effectiveOpeningBalances[name] ?? 0);
    const purchase = purchases[name] || 0;
    const bankPmt = (bankPayments[name] || 0) + (roaPerDebtor[name] || 0);
    const isJe3 = JE3_WRITEOFF_ACCOUNTS.includes(name);
    const adjustment = isJe3 ? purchase : 0; // JE3 purchases are written off as adjustments
    const closing = ob + purchase - bankPmt - adjustment;
    return { name, ob, purchase, bankPmt, adjustment, closing };
  });

  const allRows = rows;

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

  const explanationKey = `debtors-recon-explanation:${filterMonth}`;
  const [explanation, setExplanation] = useState('');
  useEffect(() => {
    setExplanation(localStorage.getItem(explanationKey) ?? '');
  }, [explanationKey]);


  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <h3 className="font-semibold text-sm">Debtors Reconciliation — {filterMonth}</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            downloadCsv(
              ['Debtor', 'Opening Balance', 'Purchases', 'Payments', 'Adjustments (JE3)', 'Closing Balance'],
              rows.map(r => [r.name, r.ob, r.purchase, r.bankPmt, r.adjustment, r.closing]),
              `debtors-recon-${filterMonth}.csv`
            );
          }}>
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
          {isFirstMonth && hasEdits && (
            <Button size="sm" variant="outline" onClick={handleSaveOB} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" />{saving ? 'Saving...' : 'Save OB'}
            </Button>
          )}
        </div>
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
          {rows.map(r => {
            const isOpen = !!expanded[r.name];
            const pDetails = purchaseDetails[r.name] ?? [];
            const payDetails = paymentDetails[r.name] ?? [];
            const canExpand = pDetails.length > 0 || payDetails.length > 0;
            return (
              <React.Fragment key={r.name}>
                <TableRow>
                  <TableCell className="text-sm">
                    <button
                      type="button"
                      onClick={() => canExpand && setExpanded(prev => ({ ...prev, [r.name]: !prev[r.name] }))}
                      className="inline-flex items-center gap-1 hover:underline disabled:opacity-40"
                      disabled={!canExpand}
                    >
                      {canExpand ? (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
                      {r.name}
                    </button>
                  </TableCell>
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
                {isOpen && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={6} className="p-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3">
                        <div>
                          <div className="text-xs font-semibold mb-1">Purchases ({pDetails.length})</div>
                          {pDetails.length === 0 ? (
                            <div className="text-xs text-muted-foreground">No purchase line items</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left font-normal">Date</th>
                                  <th className="text-left font-normal">Source</th>
                                  <th className="text-right font-normal">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pDetails.map((d, i) => (
                                  <tr key={i}>
                                    <td>{d.date}</td>
                                    <td>{d.source}</td>
                                    <td className="text-right"><CurrencyDisplay value={d.amount} /></td>
                                  </tr>
                                ))}
                                <tr className="border-t font-semibold">
                                  <td colSpan={2}>Total Purchases</td>
                                  <td className="text-right"><CurrencyDisplay value={pDetails.reduce((s, d) => s + d.amount, 0)} /></td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-semibold mb-1">Payments ({payDetails.length})</div>
                          {payDetails.length === 0 ? (
                            <div className="text-xs text-muted-foreground">No payment line items</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left font-normal">Date</th>
                                  <th className="text-left font-normal">Source</th>
                                  <th className="text-left font-normal">Description</th>
                                  <th className="text-right font-normal">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {payDetails.map((d, i) => (
                                  <tr key={i}>
                                    <td>{d.date}</td>
                                    <td>{d.source}</td>
                                    <td className="truncate max-w-[240px]">{d.description}</td>
                                    <td className="text-right"><CurrencyDisplay value={d.amount} /></td>
                                  </tr>
                                ))}
                                <tr className="border-t font-semibold">
                                  <td colSpan={3}>Total Payments</td>
                                  <td className="text-right"><CurrencyDisplay value={payDetails.reduce((s, d) => s + d.amount, 0)} /></td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
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
      <div className="border-t px-4 py-3 bg-muted/10">
        <label className="text-xs font-semibold block mb-1">Explanation / Variance Notes</label>
        <textarea
          value={explanation}
          onChange={(e) => {
            setExplanation(e.target.value);
            localStorage.setItem(explanationKey, e.target.value);
          }}
          placeholder="Describe any variances, unusual movements, or notes for this month's debtors recon..."
          className="w-full min-h-[80px] text-xs p-2 border rounded bg-background resize-y"
        />
      </div>
    </div>
  );
}