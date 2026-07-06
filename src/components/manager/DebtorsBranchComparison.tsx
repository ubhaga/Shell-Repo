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

type BankLine = { id: string; amount: number; description: string; transaction_date: string };
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
  const [prevBankLines, setPrevBankLines] = useState<BankLine[]>([]);
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  const [prevOpeningBalances, setPrevOpeningBalances] = useState<Record<string, number>>({});
  const [allocations, setAllocations] = useState<{ bank_line_id: string; recon_type: string; target_name: string }[]>([]);
  const [inputs, setInputs] = useState<Record<string, BranchInput>>({});
  const [totalsExplanation, setTotalsExplanation] = useState('');
  const [saving, setSaving] = useState(false);

  const isFirstMonth = month === '2026-03';
  const prevMonth = useMemo(() => {
    const d = new Date(month + '-01');
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }, [month]);

  const loadData = useCallback(async () => {
    const [bankRes, obRes, allocRes, brRes] = await Promise.all([
      supabase.from('bank_statement_lines').select('id, amount, description, transaction_date').eq('month', month),
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

    if (!isFirstMonth) {
      const [prevBank, prevOb] = await Promise.all([
        supabase.from('bank_statement_lines').select('id, amount, description, transaction_date').eq('month', prevMonth),
        supabase.from('creditor_opening_balances').select('*').eq('month', prevMonth),
      ]);
      setPrevBankLines((prevBank.data ?? []) as BankLine[]);
      const pMap: Record<string, number> = {};
      ((prevOb.data ?? []) as { supplier: string; amount: number }[]).forEach(r => {
        if (r.supplier.startsWith('debtor:')) pMap[r.supplier.replace('debtor:', '')] = Number(r.amount);
      });
      setPrevOpeningBalances(pMap);
    } else {
      setPrevBankLines([]);
      setPrevOpeningBalances({});
    }
  }, [month, prevMonth, isFirstMonth]);

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
  const prevPurchases = useMemo(() => sumAccounts(prevMonth), [prevMonth, cashups]);
  const roa = useMemo(() => sumRoa(month), [month, cashups]);
  const prevRoa = useMemo(() => sumRoa(prevMonth), [prevMonth, cashups]);
  const bankPayments = useMemo(() => bankPaymentsFor(bankLines, true), [bankLines, allocations]);
  const prevBankPayments = useMemo(() => bankPaymentsFor(prevBankLines, false), [prevBankLines]);

  const effectiveOB = useMemo(() => {
    const cf: Record<string, number> = { ...openingBalances };
    if (!isFirstMonth) {
      DEBTOR_ACCOUNTS.forEach(name => {
        if (cf[name] !== undefined) return;
        const prevOb = prevOpeningBalances[name] ?? 0;
        const prevPurchase = prevPurchases[name] || 0;
        const prevBankPmt = (prevBankPayments[name] || 0) + (prevRoa[name] || 0);
        const prevAdj = JE3_WRITEOFF_ACCOUNTS.includes(name) ? prevPurchase : 0;
        const closing = prevOb + prevPurchase - prevBankPmt - prevAdj;
        if (closing !== 0) cf[name] = closing;
      });
    }
    return cf;
  }, [openingBalances, isFirstMonth, prevOpeningBalances, prevPurchases, prevBankPayments, prevRoa]);

  const rows = DEBTOR_ACCOUNTS.map(name => {
    const ob = effectiveOB[name] ?? 0;
    const purchase = purchases[name] || 0;
    const bankPmt = (bankPayments[name] || 0) + (roa[name] || 0);
    const isJe3 = JE3_WRITEOFF_ACCOUNTS.includes(name);
    const adjustmentJe3 = isJe3 ? purchase : 0;
    const reconClosing = ob + purchase - bankPmt - adjustmentJe3;
    const input = inputs[name] ?? { branch: 0, adjustment: 0, explanation: '' };
    const difference = reconClosing - input.branch - input.adjustment;
    return { name, reconClosing, ...input, difference };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      recon: acc.recon + r.reconClosing,
      branch: acc.branch + r.branch,
      adj: acc.adj + r.adjustment,
      diff: acc.diff + r.difference,
    }),
    { recon: 0, branch: 0, adj: 0, diff: 0 },
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

  return (
    <Section title="5. Debtors Branch Comparison" color="purple">
      <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_2fr] gap-2 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
        <span>Debtor</span>
        <span className="text-right">Recon Closing</span>
        <span className="text-right">Branch Value</span>
        <span className="text-right">Adjustment</span>
        <span className="text-right">Difference</span>
        <span>Explanation</span>
      </div>
      {rows.map(r => (
        <div key={r.name} className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_2fr] gap-2 px-3 py-1.5 border-b text-sm items-center">
          <span className="text-muted-foreground">{r.name}</span>
          <CurrencyDisplay value={r.reconClosing} className="text-right" />
          <CurrencyInput value={r.branch} onChange={v => setInput(r.name, { branch: v })} className="text-right w-full" allowNegative />
          <CurrencyInput value={r.adjustment} onChange={v => setInput(r.name, { adjustment: v })} className="text-right w-full" allowNegative />
          <CurrencyDisplay value={r.difference} className={`text-right font-semibold ${Math.abs(r.difference) < 0.01 ? 'text-green-600' : 'text-destructive'}`} />
          <input
            value={r.explanation}
            onChange={e => setInput(r.name, { explanation: e.target.value })}
            className="input-cell w-full text-left text-xs"
            placeholder={Math.abs(r.difference) < 0.01 ? '' : 'Explain variance...'}
          />
        </div>
      ))}
      <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_2fr] gap-2 px-3 py-2 bg-secondary font-semibold text-sm items-center">
        <span>Totals</span>
        <CurrencyDisplay value={totals.recon} className="text-right" highlight />
        <CurrencyDisplay value={totals.branch} className="text-right" highlight />
        <CurrencyDisplay value={totals.adj} className="text-right" highlight />
        <CurrencyDisplay value={totals.diff} className="text-right" highlight />
        <span />
      </div>
      <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_2fr] gap-2 px-3 py-2 border-b bg-secondary/40 text-sm items-start">
        <span className="col-span-5 text-muted-foreground text-xs">Totals Explanation</span>
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
