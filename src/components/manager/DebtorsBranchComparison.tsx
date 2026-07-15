import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { useMasterDataStore } from '@/store/masterDataStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay, CurrencyInput, Section } from '@/components/ui/CashupUI';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { acctSortValue } from '@/components/settings/MasterDataSettings';

interface Props {
  month: string;
}

const BANK_PAYMENT_RULES: { pattern: RegExp; account: string }[] = [
  { pattern: /ST TERESA/i, account: 'St Theresas' },
  { pattern: /OSIRIS.*LANCASTER|LANCASTER.*PHARMACY/i, account: 'Lancaster Pharmacy' },
  { pattern: /FNB OB.*HPT|HYDE PARK TOYOTA/i, account: 'Hyde Park Toyota' },
  { pattern: /CR BP ZOO.*ISUZU/i, account: 'Isuzu bakkie' },
  { pattern: /CR BP ZOO.*MAHINDRA|BP ZOO MAHINDRA/i, account: 'Mahindra' },
  { pattern: /CR BP ZOO.*LAKE.*DSL|BP ZOO LAKE DSL/i, account: 'Bp Zoolake' },
];

// Fallback debtors — kept so accounts referenced by BANK_PAYMENT_RULES / JE3
// always resolve even if removed from Master Data settings.
const FALLBACK_DEBTOR_ACCOUNTS = [
  'Mahindra', 'Lancaster Pharmacy', 'Hyde Park Toyota', 'Hltc', 'St Theresas',
  'Sayinile', 'Red cross', 'Umesh', 'Isuzu bakkie', 'Bp Zoolake',
  'Bp Zoolake Account Customer', 'Shell Parkhurst', 'House tech', 'Moses bpzl',
  'Generator', 'Shop Expense',
];
const JE3_WRITEOFF_ACCOUNTS = ['Generator', 'Shop Expense', 'Umesh'];

type BankLine = { id: string; amount: number; description: string; transaction_date: string; month: string };
type BranchInput = { branch: number; adjustment: number; explanation: string };

export function DebtorsBranchComparison({ month }: Props) {
  const { cashups } = useCashupStore();
  const masterAccounts = useMasterDataStore(s => s.accounts);
  const accountNumbers = useMasterDataStore(s => s.accountNumbers);
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
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [historyBankLines, setHistoryBankLines] = useState<BankLine[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  const [historyOpeningBalances, setHistoryOpeningBalances] = useState<Record<string, Record<string, number>>>({});
  const [allocations, setAllocations] = useState<{ bank_line_id: string; recon_type: string; target_name: string }[]>([]);
  const [inputs, setInputs] = useState<Record<string, BranchInput>>({});
  const [totalsExplanation, setTotalsExplanation] = useState('');
  const [saving, setSaving] = useState(false);

  const FIRST_MONTH = '2026-03';
  const isFirstMonth = month === FIRST_MONTH;

  const priorMonths = useMemo(() => {
    const out: string[] = [];
    const start = new Date(FIRST_MONTH + '-01');
    const end = new Date(month + '-01');
    const cur = new Date(start);
    while (cur < end) {
      out.push(cur.toISOString().slice(0, 7));
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }, [month]);

  const loadData = useCallback(async () => {
    const [bankRes, obRes, allocRes, brRes] = await Promise.all([
      supabase.from('bank_statement_lines').select('id, amount, description, transaction_date, month').eq('month', month),
      supabase.from('creditor_opening_balances').select('*').eq('month', month),
      supabase.from('bank_line_allocations').select('bank_line_id, recon_type, target_name').eq('recon_type', 'debtor'),
      supabase.from('master_data').select('*').eq('key', `debtors_branch_${month}`).maybeSingle(),
    ]);
    setBankLines((bankRes.data ?? []) as BankLine[]);
    setAllocations((allocRes.data ?? []) as typeof allocations);
    const obMap: Record<string, number> = {};
    ((obRes.data ?? []) as { supplier: string; amount: number }[]).forEach(r => {
      if (r.supplier.startsWith('debtor:')) obMap[r.supplier.replace('debtor:', '')] = Number(r.amount);
    });
    setOpeningBalances(obMap);
    const savedData = (brRes.data?.data ?? {}) as Record<string, unknown>;
    setInputs((savedData.inputs as Record<string, BranchInput>) ?? {});
    setTotalsExplanation((savedData.totals_explanation as string) ?? '');

    if (priorMonths.length > 0) {
      const [histBankRes, histObRes] = await Promise.all([
        supabase.from('bank_statement_lines').select('id, amount, description, transaction_date, month').in('month', priorMonths),
        supabase.from('creditor_opening_balances').select('*').in('month', priorMonths),
      ]);
      setHistoryBankLines((histBankRes.data ?? []) as (BankLine & { month: string })[]);
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
    }
  }, [month, priorMonths]);

  useEffect(() => { loadData(); }, [loadData]);

  const sumAccounts = (targetMonth: string) => {
    const totals: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(a => { totals[a] = 0; });
    cashups.filter(c => c.month === targetMonth).forEach(c => {
      for (const a of c.shop.accounts ?? []) if (totals[a.name] !== undefined) totals[a.name] += a.amount;
      for (const a of c.opt.accounts ?? []) if (totals[a.name] !== undefined) totals[a.name] += a.amount;
    });
    return totals;
  };

  const sumRoa = (targetMonth: string) => {
    const totals: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(a => { totals[a] = 0; });
    cashups.filter(c => c.month === targetMonth).forEach(c => {
      for (const r of c.shop.receipts ?? []) {
        if (r.type === 'Debtors Received on Account ROA' && r.amount > 0) {
          const ref = (r.seqNo || '').trim();
          const matched = DEBTOR_ACCOUNTS.find(a => a.toLowerCase() === ref.toLowerCase());
          if (matched) totals[matched] = (totals[matched] || 0) + r.amount;
        }
      }
    });
    return totals;
  };

  const bankPaymentsFor = (lines: BankLine[], useAllocations: boolean) => {
    const totals: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(a => { totals[a] = 0; });
    for (const line of lines) {
      if (line.amount <= 0) continue;
      if (useAllocations) {
        const alloc = allocations.find(a => a.bank_line_id === line.id);
        if (alloc) { totals[alloc.target_name] = (totals[alloc.target_name] || 0) + line.amount; continue; }
      }
      for (const rule of BANK_PAYMENT_RULES) {
        if (rule.pattern.test(line.description)) { totals[rule.account] = (totals[rule.account] || 0) + line.amount; break; }
      }
    }
    return totals;
  };

  const purchases = useMemo(() => sumAccounts(month), [month, cashups]);
  const roa = useMemo(() => sumRoa(month), [month, cashups]);
  const bankPayments = useMemo(() => bankPaymentsFor(bankLines, true), [bankLines, allocations]);

  // Chain-forward opening balance from FIRST_MONTH, matching DebtorsRecon logic.
  const effectiveOB = useMemo(() => {
    if (isFirstMonth) return { ...openingBalances };

    let balances: Record<string, number> = { ...(historyOpeningBalances[FIRST_MONTH] ?? {}) };
    for (const m of priorMonths) {
      const storedOb = historyOpeningBalances[m];
      const monthOb: Record<string, number> = {};
      DEBTOR_ACCOUNTS.forEach(name => {
        monthOb[name] = storedOb?.[name] ?? balances[name] ?? 0;
      });
      const p = sumAccounts(m);
      const r = sumRoa(m);
      const monthBank = historyBankLines.filter(b => b.month === m);
      const bp = bankPaymentsFor(monthBank, true);
      const next: Record<string, number> = {};
      DEBTOR_ACCOUNTS.forEach(name => {
        const purchase = p[name] || 0;
        const bankPmt = (bp[name] || 0) + (r[name] || 0);
        const adj = JE3_WRITEOFF_ACCOUNTS.includes(name) ? purchase : 0;
        next[name] = (monthOb[name] || 0) + purchase - bankPmt - adj;
      });
      balances = next;
    }

    const out: Record<string, number> = {};
    DEBTOR_ACCOUNTS.forEach(name => {
      out[name] = openingBalances[name] ?? balances[name] ?? 0;
    });
    return out;
  }, [isFirstMonth, openingBalances, historyOpeningBalances, historyBankLines, priorMonths, DEBTOR_ACCOUNTS, cashups, allocations]);

  const rows = DEBTOR_ACCOUNTS.map(name => {
    const ob = effectiveOB[name] ?? 0;
    const purchase = purchases[name] || 0;
    const bankPmt = (bankPayments[name] || 0) + (roa[name] || 0);
    const isJe3 = JE3_WRITEOFF_ACCOUNTS.includes(name);
    const adjustmentJe3 = isJe3 ? purchase : 0;
    const reconClosing = ob + purchase - bankPmt - adjustmentJe3;
    const input = inputs[name] ?? { branch: 0, adjustment: 0, explanation: '' };
    const total = input.branch + input.adjustment;
    const difference = total - reconClosing;
    return { name, reconClosing, ...input, total, difference };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      recon: acc.recon + r.reconClosing,
      branch: acc.branch + r.branch,
      adj: acc.adj + r.adjustment,
      total: acc.total + r.total,
      diff: acc.diff + r.difference,
    }),
    { recon: 0, branch: 0, adj: 0, total: 0, diff: 0 },
  );

  const setInput = (name: string, patch: Partial<BranchInput>) =>
    setInputs(prev => ({
      ...prev,
      [name]: { branch: 0, adjustment: 0, explanation: '', ...prev[name], ...patch },
    }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase.from('master_data').upsert(
        { key: `debtors_branch_${month}`, data: { inputs, totals_explanation: totalsExplanation } as never, updated_at: new Date().toISOString() } as never,
        { onConflict: 'key' },
      );
      toast({ title: 'Debtors branch comparison saved' });
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    }
    setSaving(false);
  };

  const gridCols = 'grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr_2fr] gap-2 px-3';

  return (
    <Section title="2. Debtors Branch Comparison" color="purple">
      <div className={`${gridCols} py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30`}>
        <span>Debtor</span>
        <span className="text-right">Recon Closing</span>
        <span className="text-right">Branch Value</span>
        <span className="text-right">Adjustment</span>
        <span className="text-right">Total</span>
        <span className="text-right">Difference</span>
        <span>Explanation</span>
      </div>
      {rows.map(r => (
        <div key={r.name} className={`${gridCols} py-1.5 border-b text-sm items-center`}>
          <span className="text-muted-foreground">{r.name}</span>
          <CurrencyDisplay value={r.reconClosing} className="text-right" />
          <CurrencyInput value={r.branch} onChange={v => setInput(r.name, { branch: v })} className="text-right w-full" allowNegative />
          <CurrencyInput value={r.adjustment} onChange={v => setInput(r.name, { adjustment: v })} className="text-right w-full" allowNegative />
          <CurrencyDisplay value={r.total} className="text-right font-semibold" />
          <CurrencyDisplay value={r.difference} className={`text-right font-semibold ${Math.abs(r.difference) < 0.01 ? 'text-green-600' : 'text-destructive'}`} />
          <input
            value={r.explanation}
            onChange={e => setInput(r.name, { explanation: e.target.value })}
            className="input-cell w-full text-left text-xs"
            placeholder={Math.abs(r.difference) < 0.01 ? '' : 'Explain variance...'}
          />
        </div>
      ))}
      <div className={`${gridCols} py-2 bg-secondary font-semibold text-sm items-center`}>
        <span>Totals</span>
        <CurrencyDisplay value={totals.recon} className="text-right" highlight />
        <CurrencyDisplay value={totals.branch} className="text-right" highlight />
        <CurrencyDisplay value={totals.adj} className="text-right" highlight />
        <CurrencyDisplay value={totals.total} className="text-right" highlight />
        <CurrencyDisplay value={totals.diff} className="text-right" highlight />
        <span />
      </div>
      <div className={`${gridCols} py-2 border-b bg-secondary/40 text-sm items-start`}>
        <span className="col-span-6 text-muted-foreground text-xs">Totals Explanation</span>
        <Textarea
          value={totalsExplanation}
          onChange={e => setTotalsExplanation(e.target.value)}
          className="w-full min-h-[60px] text-xs"
          placeholder="Explain overall variance..."
        />
      </div>
      <div className="p-3">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1" />{saving ? 'Saving...' : 'Save Branch Values'}
        </Button>
      </div>
    </Section>
  );
}
