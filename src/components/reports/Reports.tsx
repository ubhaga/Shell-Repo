import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from '@/hooks/use-toast';
import { useCashupStore } from '@/store/cashupStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { BankStatementTab } from './BankStatementTab';
import { DailySummaryReport } from './DailySummaryReport';
import { CreditorsRecon } from '@/components/recons/CreditorsRecon';
import { AirtimeRecon } from '@/components/recons/AirtimeRecon';

export function Reports({ mode = 'reports' }: { mode?: 'reports' | 'recons' }) {
  const { cashups, managerEntries } = useCashupStore();
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const monthCashups = cashups.filter(c => c.month === filterMonth);
  const monthManagers = managerEntries.filter(e => e.date.startsWith(filterMonth));

  // Compute previous month string
  const prevMonth = (() => {
    const d = new Date(filterMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const prevMonthCashups = cashups.filter(c => c.month === prevMonth);

  // Load bank statement lines for reconciliation
  const [bankLines, setBankLines] = useState<{ id: string; matched_terminal: string; amount: number; description: string; transaction_date: string }[]>([]);
  const [prevBankLines, setPrevBankLines] = useState<{ id: string; matched_terminal: string; amount: number; description: string; transaction_date: string }[]>([]);
  const loadBankLines = useCallback(async () => {
    const [cur, prev] = await Promise.all([
      supabase.from('bank_statement_lines').select('id, matched_terminal, amount, description, transaction_date').eq('month', filterMonth),
      supabase.from('bank_statement_lines').select('id, matched_terminal, amount, description, transaction_date').eq('month', prevMonth),
    ]);
    setBankLines((cur.data ?? []) as typeof bankLines);
    setPrevBankLines((prev.data ?? []) as typeof prevBankLines);
  }, [filterMonth, prevMonth]);
  useEffect(() => { loadBankLines(); }, [loadBankLines]);

  // Manual match state: key = "cashupDate|terminal", value = array of manually matched bank lines
  type BankParsedLine = { terminal: string; batch: string; amount: number; date: string; description: string; idx: number; bankLineId: string };
  const [manualMatches, setManualMatches] = useState<Record<string, BankParsedLine[]>>({});
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  // Load saved manual matches from DB (current + previous month for OB rows)
  const [prevManualMatches, setPrevManualMatches] = useState<Record<string, BankParsedLine[]>>({});
  const loadManualMatches = useCallback(async () => {
    const { data } = await supabase
      .from('speedpoint_manual_matches')
      .select('*')
      .in('month', [filterMonth, prevMonth]);
    if (data && data.length > 0) {
      const loaded: Record<string, BankParsedLine[]> = {};
      const prevLoaded: Record<string, BankParsedLine[]> = {};
      (data as { month: string; cashup_date: string; terminal: string; bank_line_idx: number; bank_amount: number; bank_description: string; bank_date: string; bank_terminal: string; bank_batch: string }[]).forEach(row => {
        const key = `${row.cashup_date}|${row.terminal}`;
        if (row.month === filterMonth) {
          if (!loaded[key]) loaded[key] = [];
          loaded[key].push({ terminal: row.bank_terminal, batch: row.bank_batch, amount: Number(row.bank_amount), date: row.bank_date, description: row.bank_description, idx: row.bank_line_idx });
        } else {
          if (!prevLoaded[key]) prevLoaded[key] = [];
          prevLoaded[key].push({ terminal: row.bank_terminal, batch: row.bank_batch, amount: Number(row.bank_amount), date: row.bank_date, description: row.bank_description, idx: row.bank_line_idx });
        }
      });
      setManualMatches(loaded);
      setPrevManualMatches(prevLoaded);
    } else {
      setManualMatches({});
      setPrevManualMatches({});
    }
  }, [filterMonth, prevMonth]);
  useEffect(() => { loadManualMatches(); }, [loadManualMatches]);

  // Diff clearances: pairs of differences that offset each other
  type DiffClearance = { id: string; terminal: string; date_1: string; date_2: string; amount: number };
  const [diffClearances, setDiffClearances] = useState<DiffClearance[]>([]);
  const [selectedDiffForClearing, setSelectedDiffForClearing] = useState<{ date: string; terminal: string; diff: number } | null>(null);

  const loadDiffClearances = useCallback(async () => {
    const { data } = await supabase
      .from('speedpoint_diff_clearances')
      .select('*')
      .eq('month', filterMonth);
    setDiffClearances((data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      terminal: r.terminal as string,
      date_1: r.date_1 as string,
      date_2: r.date_2 as string,
      amount: Number(r.amount),
    })));
  }, [filterMonth]);
  useEffect(() => { loadDiffClearances(); }, [loadDiffClearances]);

  // Check if a date+terminal diff is cleared
  const isDiffCleared = useCallback((date: string, terminal: string) => {
    return diffClearances.some(c => c.terminal === terminal && (c.date_1 === date || c.date_2 === date));
  }, [diffClearances]);

  const getClearanceForCell = useCallback((date: string, terminal: string) => {
    return diffClearances.find(c => c.terminal === terminal && (c.date_1 === date || c.date_2 === date));
  }, [diffClearances]);

  const handleDiffClick = async (date: string, terminal: string, diff: number) => {
    // If already cleared, remove clearance
    const existing = getClearanceForCell(date, terminal);
    if (existing) {
      await supabase.from('speedpoint_diff_clearances').delete().eq('id', existing.id);
      setDiffClearances(prev => prev.filter(c => c.id !== existing.id));
      toast({ title: 'Clearance removed', description: `Unlinked ${date} from its paired difference.` });
      return;
    }

    if (!selectedDiffForClearing) {
      // First selection
      setSelectedDiffForClearing({ date, terminal, diff });
      toast({ title: 'First difference selected', description: `Now click the offsetting difference to pair with ${date} (${terminal}).` });
    } else {
      // Second selection — must be same terminal, different date
      if (selectedDiffForClearing.terminal !== terminal) {
        toast({ title: 'Terminal mismatch', description: 'Both differences must be for the same terminal.', variant: 'destructive' });
        setSelectedDiffForClearing(null);
        return;
      }
      if (selectedDiffForClearing.date === date) {
        setSelectedDiffForClearing(null);
        return;
      }
      // Save clearance
      const { data } = await supabase.from('speedpoint_diff_clearances').insert({
        month: filterMonth,
        terminal,
        date_1: selectedDiffForClearing.date,
        date_2: date,
        amount: selectedDiffForClearing.diff,
      } as never).select();
      if (data && data.length > 0) {
        const r = data[0] as Record<string, unknown>;
        setDiffClearances(prev => [...prev, {
          id: r.id as string,
          terminal: r.terminal as string,
          date_1: r.date_1 as string,
          date_2: r.date_2 as string,
          amount: Number(r.amount),
        }]);
      }
      toast({ title: 'Differences cleared', description: `Paired ${selectedDiffForClearing.date} with ${date} for ${terminal}.` });
      setSelectedDiffForClearing(null);
    }
  };

  // Build lookup: vendor -> array of dates with invoices
  const managerPayoutByVendor = new Map<string, Map<string, number>>();
  monthManagers.forEach(e => {
    e.payoutInvoices.forEach(inv => {
      const vendor = inv.supplier.toLowerCase().trim();
      if (!managerPayoutByVendor.has(vendor)) managerPayoutByVendor.set(vendor, new Map());
      const dateMap = managerPayoutByVendor.get(vendor)!;
      dateMap.set(e.date, (dateMap.get(e.date) ?? 0) + 1);
    });
  });
  // Track consumption: vendor+date -> consumed count
  const invoiceConsumed = new Map<string, number>();

  type MatchStatus = 'matched' | 'matched-other-day' | 'unmatched';

  const matchPayout = (payoutDate: string, vendor: string): MatchStatus => {
    const v = vendor.toLowerCase().trim();
    const dateMap = managerPayoutByVendor.get(v);
    if (!dateMap) return 'unmatched';
    // Try same-day first
    const sameKey = `${v}|${payoutDate}`;
    const sameAvail = (dateMap.get(payoutDate) ?? 0) - (invoiceConsumed.get(sameKey) ?? 0);
    if (sameAvail > 0) {
      invoiceConsumed.set(sameKey, (invoiceConsumed.get(sameKey) ?? 0) + 1);
      return 'matched';
    }
    // Try other days
    for (const [date, count] of dateMap) {
      const otherKey = `${v}|${date}`;
      const otherAvail = count - (invoiceConsumed.get(otherKey) ?? 0);
      if (otherAvail > 0) {
        invoiceConsumed.set(otherKey, (invoiceConsumed.get(otherKey) ?? 0) + 1);
        return 'matched-other-day';
      }
    }
    return 'unmatched';
  };

  const payoutReport = monthCashups.flatMap(c =>
    c.shop.payouts.map(p => ({
      date: c.date,
      cashier: c.cashierName,
      vendor: p.vendor,
      amount: p.amount,
      status: matchPayout(c.date, p.vendor) as MatchStatus,
    }))
  ).concat(monthCashups.map(c => ({
    date: c.date,
    cashier: c.cashierName,
    vendor: 'Lotto',
    amount: c.shop.lottoPayouts,
    status: matchPayout(c.date, 'Lotto') as MatchStatus,
  })).filter(r => r.amount > 0));
  const payoutTotal = payoutReport.reduce((s, r) => s + r.amount, 0);

  // Receipts report
  const receiptsReport = monthCashups.flatMap(c =>
    c.shop.receipts.map(r => ({
      date: c.date,
      cashier: c.cashierName,
      type: r.type,
      seqNo: r.seqNo,
      amount: r.amount,
    }))
  );
  const receiptsTotal = receiptsReport.reduce((s, r) => s + r.amount, 0);

  // Speedpoints report — one row per date, columns per terminal
  const SP_TERMINALS = ['Term 247608', 'Forecourt 929661', 'Retail 200660', 'Scan to pay'];
  const [selectedTerminal, setSelectedTerminal] = useState<string>('all');
  const visibleTerminals = selectedTerminal === 'all' ? SP_TERMINALS : [selectedTerminal];
  type SpDateRow = {
    date: string;
    terminals: Record<string, { batchNo: string; shopAmount: number; optAmount: number; total: number }>;
    total: number;
  };
  const speedpointByDate: SpDateRow[] = monthCashups.map(c => {
    const termMap: SpDateRow['terminals'] = {};
    SP_TERMINALS.forEach(t => { termMap[t] = { batchNo: '', shopAmount: 0, optAmount: 0, total: 0 }; });
    c.shop.speedpoints.forEach(sp => {
      if (!termMap[sp.terminal]) termMap[sp.terminal] = { batchNo: '', shopAmount: 0, optAmount: 0, total: 0 };
      termMap[sp.terminal].batchNo = sp.batchNo || termMap[sp.terminal].batchNo;
      termMap[sp.terminal].shopAmount += sp.shopAmount;
    });
    c.opt.speedpoints.forEach(sp => {
      if (!termMap[sp.terminal]) termMap[sp.terminal] = { batchNo: '', shopAmount: 0, optAmount: 0, total: 0 };
      termMap[sp.terminal].batchNo = sp.batchNo || termMap[sp.terminal].batchNo;
      termMap[sp.terminal].optAmount += sp.optAmount;
    });
    let rowTotal = 0;
    SP_TERMINALS.forEach(t => {
      const v = termMap[t];
      if (v) { v.total = v.shopAmount + v.optAmount; rowTotal += v.total; }
    });
    // Also compute totals for non-SP terminals but don't add to rowTotal
    Object.entries(termMap).forEach(([k, v]) => {
      if (!SP_TERMINALS.includes(k)) { v.total = v.shopAmount + v.optAmount; }
    });
    return { date: c.date, terminals: termMap, total: rowTotal };
  });
  const spColumnTotals: Record<string, number> = {};
  SP_TERMINALS.forEach(t => { spColumnTotals[t] = speedpointByDate.reduce((s, r) => s + (r.terminals[t]?.total ?? 0), 0); });
  const spGrandTotal = speedpointByDate.reduce((s, r) => s + r.total, 0);

  // Extract terminal number from SP_TERMINALS name (e.g., 'Term 247608' -> '247608')
  const TERMINAL_NUM_MAP: Record<string, string> = {};
  SP_TERMINALS.forEach(t => {
    const match = t.match(/(\d{6})/);
    if (match) TERMINAL_NUM_MAP[t] = match[1];
  });

  // Parse bank lines: extract batch number from description and build lookup by terminal+batch
  const bankParsed: BankParsedLine[] = [];
  bankLines.forEach((l, idx) => {
    if (!l.matched_terminal || !SP_TERMINALS.includes(l.matched_terminal)) return;
    const termNum = TERMINAL_NUM_MAP[l.matched_terminal] || '';
    const batchMatch = l.description.match(new RegExp(`${termNum}\\s+(\\d+)`));
    const batch = batchMatch ? batchMatch[1] : '';
    bankParsed.push({ terminal: l.matched_terminal, batch, amount: l.amount, date: l.transaction_date, description: l.description, idx });
  });

  // Build auto-match lookup: key = "terminal|batch" -> bank amount
  const bankLookup: Record<string, number> = {};
  bankParsed.forEach(bp => {
    if (!bp.batch) return;
    const key = `${bp.terminal}|${bp.batch}`;
    bankLookup[key] = (bankLookup[key] || 0) + bp.amount;
  });

  // Collect all manually matched bank line indices
  const manuallyMatchedIdxs = new Set<number>();
  Object.values(manualMatches).forEach(arr => arr.forEach(bp => manuallyMatchedIdxs.add(bp.idx)));

  // Build per-row match data including manual matches
  // Each bank amount is consumed by the first cashup row that claims it
  type SpRowMatch = Record<string, { bankAmount: number; diff: number; matched: boolean; manual: boolean }>;
  const consumedBankKeys = new Set<string>();
  const speedpointMatches: SpRowMatch[] = speedpointByDate.map(r => {
    const rowMatch: SpRowMatch = {};
    SP_TERMINALS.forEach(t => {
      const td = r.terminals[t];
      if (!td || td.total === 0) { rowMatch[t] = { bankAmount: 0, diff: 0, matched: false, manual: false }; return; }
      // Auto match by terminal+batch — only if not already consumed by a prior row
      const key = `${t}|${td.batchNo}`;
      let bankAmt = 0;
      let isManual = false;
      if (!consumedBankKeys.has(key)) {
        bankAmt = bankLookup[key] ?? 0;
        if (bankAmt > 0) consumedBankKeys.add(key);
      }
      // Add manual matches for this cell
      const manualKey = `${r.date}|${t}`;
      const manualLines = manualMatches[manualKey] || [];
      if (manualLines.length > 0) {
        bankAmt += manualLines.reduce((s, ml) => s + ml.amount, 0);
        isManual = true;
      }
      const diff = td.total - bankAmt;
      rowMatch[t] = { bankAmount: bankAmt, diff, matched: bankAmt > 0 && Math.abs(diff) < 0.01, manual: isManual };
    });
    return rowMatch;
  });

  // ── Opening Balance: previous month's unmatched batches ──
  // Parse previous month bank lines
  const prevBankParsed: BankParsedLine[] = [];
  prevBankLines.forEach((l, idx) => {
    if (!l.matched_terminal || !SP_TERMINALS.includes(l.matched_terminal)) return;
    const termNum = TERMINAL_NUM_MAP[l.matched_terminal] || '';
    const batchMatch = l.description.match(new RegExp(`${termNum}\\s+(\\d+)`));
    const batch = batchMatch ? batchMatch[1] : '';
    prevBankParsed.push({ terminal: l.matched_terminal, batch, amount: l.amount, date: l.transaction_date, description: l.description, idx: idx + 100000 });
  });
  const prevBankLookup: Record<string, number> = {};
  prevBankParsed.forEach(bp => { if (bp.batch) { const k = `${bp.terminal}|${bp.batch}`; prevBankLookup[k] = (prevBankLookup[k] || 0) + bp.amount; } });
  const prevManuallyMatchedIdxs = new Set<number>();
  Object.values(prevManualMatches).forEach(arr => arr.forEach(bp => prevManuallyMatchedIdxs.add(bp.idx)));

  // Build previous month speedpoint data
  const prevSpeedpointByDate = prevMonthCashups.map(c => {
    const termMap: SpDateRow['terminals'] = {};
    SP_TERMINALS.forEach(t => { termMap[t] = { batchNo: '', shopAmount: 0, optAmount: 0, total: 0 }; });
    c.shop.speedpoints.forEach(sp => {
      if (!termMap[sp.terminal]) termMap[sp.terminal] = { batchNo: '', shopAmount: 0, optAmount: 0, total: 0 };
      termMap[sp.terminal].batchNo = sp.batchNo || termMap[sp.terminal].batchNo;
      termMap[sp.terminal].shopAmount += sp.shopAmount;
    });
    c.opt.speedpoints.forEach(sp => {
      if (!termMap[sp.terminal]) termMap[sp.terminal] = { batchNo: '', shopAmount: 0, optAmount: 0, total: 0 };
      termMap[sp.terminal].batchNo = sp.batchNo || termMap[sp.terminal].batchNo;
      termMap[sp.terminal].optAmount += sp.optAmount;
    });
    SP_TERMINALS.forEach(t => { const v = termMap[t]; if (v) v.total = v.shopAmount + v.optAmount; });
    return { date: c.date, terminals: termMap };
  });

  // Find unmatched batches from previous month
  type OBRow = { date: string; terminal: string; batchNo: string; cashupAmount: number; bankAmount: number; diff: number; manualBankAmount: number };
  const openingBalanceRows: OBRow[] = [];
  const prevConsumedKeys = new Set<string>();
  prevSpeedpointByDate.forEach(r => {
    SP_TERMINALS.forEach(t => {
      const td = r.terminals[t];
      if (!td || td.total === 0) return;
      const batchKey = `${t}|${td.batchNo}`;
      if (prevConsumedKeys.has(batchKey)) return;
      prevConsumedKeys.add(batchKey);
      const autoBankAmt = prevBankLookup[batchKey] ?? 0;
      // Check manual matches from previous month
      const prevManualKey = `${r.date}|${t}`;
      const prevManualLines = prevManualMatches[prevManualKey] || [];
      const prevManualAmt = prevManualLines.reduce((s, ml) => s + ml.amount, 0);
      const totalBank = autoBankAmt + prevManualAmt;
      const diff = td.total - totalBank;
      if (Math.abs(diff) > 0.01) {
        // Check if this OB row has manual matches in the current month
        const obKey = `OB-${r.date}|${t}`;
        const obManualLines = manualMatches[obKey] || [];
        const obManualAmt = obManualLines.reduce((s, ml) => s + ml.amount, 0);
        openingBalanceRows.push({
          date: r.date,
          terminal: t,
          batchNo: td.batchNo,
          cashupAmount: diff, // The outstanding amount carried forward
          bankAmount: obManualAmt,
          diff: diff - obManualAmt,
          manualBankAmount: obManualAmt,
        });
      }
    });
  });

  // Bank totals per terminal
  const bankTerminalTotals: Record<string, number> = {};
  SP_TERMINALS.forEach(t => { bankTerminalTotals[t] = bankParsed.filter(bp => bp.terminal === t).reduce((s, bp) => s + bp.amount, 0); });
  const bankMatchedGrandTotal = Object.values(bankTerminalTotals).reduce((s, v) => s + v, 0);

  // Unmatched: bank lines not auto-matched and not manually matched
  // Use consumedBankKeys from matching above instead of re-deriving
  const unmatchedTerminalLines = bankParsed.filter(bp => {
    if (manuallyMatchedIdxs.has(bp.idx)) return false;
    if (!bp.batch) return true;
    return !consumedBankKeys.has(`${bp.terminal}|${bp.batch}`);
  });

  // Auto-scroll during drag
  const scrollIntervalRef = useRef<number | null>(null);
  const clearScrollInterval = () => {
    if (scrollIntervalRef.current) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null; }
  };

  // Drag-and-drop handlers
  const handleDragStart = (e: React.DragEvent, bp: BankParsedLine) => {
    e.dataTransfer.setData('application/json', JSON.stringify(bp));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(targetKey);
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  // Global drag-over handler for auto-scrolling near edges
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      const EDGE = 80;
      const SPEED = 12;
      clearScrollInterval();
      if (e.clientY < EDGE) {
        scrollIntervalRef.current = window.setInterval(() => window.scrollBy(0, -SPEED), 16);
      } else if (e.clientY > window.innerHeight - EDGE) {
        scrollIntervalRef.current = window.setInterval(() => window.scrollBy(0, SPEED), 16);
      }
    };
    const onDragEnd = () => clearScrollInterval();
    const onDrop = () => clearScrollInterval();
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragend', onDragEnd);
    window.addEventListener('drop', onDrop);
    return () => {
      clearScrollInterval();
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragend', onDragEnd);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const handleDrop = async (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    setDragOverTarget(null);
    try {
      const bp: BankParsedLine = JSON.parse(e.dataTransfer.getData('application/json'));
      setManualMatches(prev => ({
        ...prev,
        [targetKey]: [...(prev[targetKey] || []), bp],
      }));
      // Save to DB
      const [cashupDate, terminal] = targetKey.split('|');
      await supabase.from('speedpoint_manual_matches').insert({
        month: filterMonth,
        cashup_date: cashupDate,
        terminal,
        bank_line_idx: bp.idx,
        bank_amount: bp.amount,
        bank_description: bp.description,
        bank_date: bp.date,
        bank_terminal: bp.terminal,
        bank_batch: bp.batch,
      } as never);
    } catch {}
  };

  const handleRemoveManualMatch = async (targetKey: string, bpIdx: number) => {
    setManualMatches(prev => {
      const updated = { ...prev };
      updated[targetKey] = (updated[targetKey] || []).filter(bp => bp.idx !== bpIdx);
      if (updated[targetKey].length === 0) delete updated[targetKey];
      return updated;
    });
    // Delete from DB
    const [cashupDate, terminal] = targetKey.split('|');
    await supabase.from('speedpoint_manual_matches').delete()
      .eq('month', filterMonth)
      .eq('cashup_date', cashupDate)
      .eq('terminal', terminal)
      .eq('bank_line_idx', bpIdx);
  };

  // Accounts report — shop + OPT combined per day
  const accountsReport = monthCashups.flatMap(c => {
    const shopRows = c.shop.accounts.map(a => ({
      date: c.date,
      cashier: c.cashierName,
      shift: 'Shop' as const,
      name: a.name,
      amount: a.amount,
    }));
    const optRows = c.opt.accounts.map(a => ({
      date: c.date,
      cashier: c.cashierName,
      shift: 'OPT' as const,
      name: a.name,
      amount: a.amount,
    }));
    return [...shopRows, ...optRows];
  });
  const accountsTotal = accountsReport.reduce((s, r) => s + r.amount, 0);

  // Invoice report
  const invoiceReport = monthManagers.flatMap(e => [
    ...e.payoutInvoices.map(i => ({ date: e.date, type: 'Payout', supplier: i.supplier, category: i.category, docNum: i.branchDocNum, inclusive: i.inclusive, vat: i.vat })),
    ...e.eftInvoices.map(i => ({ date: e.date, type: 'EFT', supplier: i.supplier, category: i.category, docNum: i.branchDocNum, inclusive: i.inclusive, vat: i.vat })),
  ]);
  const invoiceTotal = invoiceReport.reduce((s, r) => s + r.inclusive, 0);
  const invoiceVatTotal = invoiceReport.reduce((s, r) => s + r.vat, 0);

  // MOP report — Cash (CC) uses cashConnectTotal from section 5 MOP Cash
  const mopReport = monthCashups.map(c => {
    const spTerminals = ['Term 247608', 'Forecourt 929661', 'Retail 200660'];
    const shopSP = c.shop.speedpoints.filter(sp => spTerminals.includes(sp.terminal)).reduce((s, sp) => s + sp.shopAmount, 0);
    const optSP = c.opt.speedpoints.filter(sp => spTerminals.includes(sp.terminal)).reduce((s, sp) => s + sp.optAmount, 0);
    const scanToPay = c.shop.speedpoints.filter(sp => sp.terminal === 'Scan to pay').reduce((s, sp) => s + sp.shopAmount, 0)
      + c.opt.speedpoints.filter(sp => sp.terminal === 'Scan to pay').reduce((s, sp) => s + sp.optAmount, 0);
    const vPlus = c.shop.speedpoints.filter(sp => sp.terminal === 'V Plus').reduce((s, sp) => s + sp.shopAmount, 0)
      + c.opt.speedpoints.filter(sp => sp.terminal === 'V Plus').reduce((s, sp) => s + sp.optAmount, 0);
    const shopAcc = c.shop.accounts.reduce((s, a) => s + a.amount, 0);
    const optAcc = c.opt.accounts.reduce((s, a) => s + a.amount, 0);
    const cash = c.shop.cashDepositedBanking + c.shop.easyPay + c.shop.coins;
    return {
      date: c.date,
      cash,
      shopSpeedpoint: shopSP,
      optSpeedpoint: optSP,
      totalSpeedpoint: shopSP + optSP,
      scanToPay,
      vPlus,
      accounts: shopAcc + optAcc,
      total: cash + shopSP + optSP + scanToPay + vPlus + shopAcc + optAcc,
    };
  });

  const exportCSV = (data: Record<string, string | number>[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => r[h]).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
  };

  const formatDate = (d: string) => {
    try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; }
  };

  const monthLabel = format(new Date(filterMonth + '-01'), 'MMMM yyyy');

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-card border rounded-lg p-3 flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Month:</label>
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="input-cell" />
        <span className="text-sm text-muted-foreground ml-2">
          {monthCashups.length} cashup days · {monthManagers.length} manager entries
        </span>
      </div>

      <Tabs defaultValue={mode === 'recons' ? 'speedpoints' : 'daily-summary'}>
        {mode === 'reports' ? (
        <TabsList className="grid grid-cols-7 w-full">
          <TabsTrigger value="daily-summary">Daily Summary</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="mop">MOP</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
        </TabsList>
        ) : (
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="speedpoints">Speedpoints</TabsTrigger>
          <TabsTrigger value="creditors">Creditors</TabsTrigger>
          <TabsTrigger value="airtime">Airtime</TabsTrigger>
        </TabsList>
        )}

        {/* Daily Summary */}
        <TabsContent value="daily-summary">
          <DailySummaryReport filterMonth={filterMonth} />
        </TabsContent>

        {/* Payouts */}
        <TabsContent value="payouts">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Detailed Payouts — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(payoutReport.map(({status, ...rest}) => ({...rest, invoice: status === 'matched' ? 'Yes' : status === 'matched-other-day' ? 'Yes (diff day)' : 'No'})), `payouts-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount (Incl.)</TableHead>
                  <TableHead className="text-center">Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payoutReport.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No payout data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {payoutReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-sm">{r.cashier}</TableCell>
                        <TableCell className="text-sm">{r.vendor}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.amount} /></TableCell>
                        <TableCell className="text-center">
                          {r.status === 'matched'
                            ? <span className="text-green-600 font-bold">✓</span>
                            : r.status === 'matched-other-day'
                            ? <span className="text-orange-500 font-bold">✓</span>
                            : <span className="text-destructive font-bold">✗</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={payoutTotal} highlight /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
            {payoutReport.length > 0 && (
              <div className="border-t p-4">
                <h4 className="text-sm font-semibold mb-2">Summary by Vendor</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(
                    payoutReport.reduce((acc, r) => { acc[r.vendor] = (acc[r.vendor] || 0) + r.amount; return acc; }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).map(([vendor, total]) => (
                    <div key={vendor} className="flex justify-between text-sm bg-muted/30 rounded px-2 py-1">
                      <span className="text-muted-foreground truncate mr-2">{vendor}</span>
                      <CurrencyDisplay value={total} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Receipts */}
        <TabsContent value="receipts">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Detailed Receipts — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(receiptsReport, `receipts-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Seq No.</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receiptsReport.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No receipt data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {receiptsReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-sm">{r.cashier}</TableCell>
                        <TableCell className="text-sm">{r.type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.seqNo}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.amount} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={receiptsTotal} highlight /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
            {receiptsReport.length > 0 && (
              <div className="border-t p-4">
                <h4 className="text-sm font-semibold mb-2">Summary by Type</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(
                    receiptsReport.reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + r.amount; return acc; }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).map(([type, total]) => (
                    <div key={type} className="flex justify-between text-sm bg-muted/30 rounded px-2 py-1">
                      <span className="text-muted-foreground truncate mr-2">{type}</span>
                      <CurrencyDisplay value={total} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Speedpoints */}
        <TabsContent value="speedpoints">
          <div className={`flex gap-4 ${unmatchedTerminalLines.length > 0 ? '' : ''}`}>
            {/* Main speedpoint report */}
            <div className={`bg-card border rounded-lg overflow-hidden ${unmatchedTerminalLines.length > 0 ? 'flex-1 min-w-0' : 'w-full'}`}>
              <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-sm">Speedpoint Report — {monthLabel}</h3>
                  {selectedDiffForClearing && (
                    <div className="flex items-center gap-2 bg-primary/10 rounded px-2 py-1 text-xs">
                      <span className="text-primary font-medium">
                        Selecting pair for {selectedDiffForClearing.date} ({selectedDiffForClearing.terminal})
                      </span>
                      <button onClick={() => setSelectedDiffForClearing(null)} className="text-destructive font-bold hover:text-destructive/80">✕</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                    <button onClick={() => setSelectedTerminal('all')} className={`px-2 py-1 text-xs rounded ${selectedTerminal === 'all' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>All</button>
                    {SP_TERMINALS.map(t => (
                      <button key={t} onClick={() => setSelectedTerminal(t)} className={`px-2 py-1 text-xs rounded ${selectedTerminal === t ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    const rows = speedpointByDate.map(r => {
                      const row: Record<string, string | number> = { Date: r.date };
                      SP_TERMINALS.forEach(t => {
                        row[`Batch# ${t}`] = r.terminals[t]?.batchNo ?? '';
                        row[t] = r.terminals[t]?.total ?? 0;
                      });
                      row.Total = r.total;
                      return row;
                    });
                    exportCSV(rows, `speedpoints-${filterMonth}.csv`);
                  }}>
                    <Download className="h-3.5 w-3.5 mr-1" />Export CSV
                  </Button>
                </div>
              </div>
              <TooltipProvider>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2} className="align-bottom">Date</TableHead>
                      {visibleTerminals.map(t => (
                        <TableHead key={t} colSpan={bankLines.length > 0 ? 4 : 2} className="text-center border-l">{t}</TableHead>
                      ))}
                      <TableHead rowSpan={2} className="text-right align-bottom border-l">Total</TableHead>
                    </TableRow>
                    <TableRow>
                      {visibleTerminals.map(t => (
                        <React.Fragment key={t}>
                          <TableHead className="text-center border-l text-xs text-muted-foreground">Batch#</TableHead>
                          <TableHead className="text-right text-xs text-muted-foreground">Cashup</TableHead>
                          {bankLines.length > 0 && (
                            <>
                              <TableHead className="text-right text-xs text-muted-foreground">Bank</TableHead>
                              <TableHead className="text-right text-xs text-muted-foreground">Diff</TableHead>
                            </>
                          )}
                        </React.Fragment>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {speedpointByDate.length === 0 ? (
                      <TableRow><TableCell colSpan={2 + visibleTerminals.length * (bankLines.length > 0 ? 4 : 2)} className="text-center text-muted-foreground py-8">No speedpoint data for this month</TableCell></TableRow>
                    ) : (
                      <>
                        {/* Opening Balance rows — previous month unmatched batches */}
                        {openingBalanceRows.length > 0 && (
                          <>
                            <TableRow className="bg-amber-50 dark:bg-amber-950/30 border-b-2">
                              <TableCell colSpan={2 + visibleTerminals.length * (bankLines.length > 0 ? 4 : 2)} className="font-semibold text-sm text-amber-800 dark:text-amber-300 py-1">
                                Opening Balance — Outstanding from {format(new Date(prevMonth + '-01'), 'MMMM yyyy')}
                              </TableCell>
                            </TableRow>
                            {openingBalanceRows
                              .filter(ob => visibleTerminals.includes(ob.terminal))
                              .map((ob, obIdx) => {
                                const obDropKey = `OB-${ob.date}|${ob.terminal}`;
                                const obManualLines = manualMatches[obDropKey] || [];
                                const isDragOver = dragOverTarget === obDropKey;
                                const isMatched = Math.abs(ob.diff) < 0.01;
                                return (
                                  <TableRow key={`ob-${obIdx}`} className={`${isMatched ? 'bg-green-50 dark:bg-green-950/20' : 'bg-amber-50/50 dark:bg-amber-950/10'} hover:bg-muted/30`}>
                                    <TableCell className="text-sm font-mono text-muted-foreground">{format(new Date(ob.date), 'dd/MM/yyyy')}</TableCell>
                                    {visibleTerminals.map(t => {
                                      if (t !== ob.terminal) {
                                        return (
                                          <React.Fragment key={t}>
                                            <TableCell className="border-l"></TableCell>
                                            <TableCell></TableCell>
                                            {bankLines.length > 0 && (<><TableCell></TableCell><TableCell></TableCell></>)}
                                          </React.Fragment>
                                        );
                                      }
                                      return (
                                        <React.Fragment key={t}>
                                          <TableCell className="text-center text-sm text-muted-foreground border-l">{ob.batchNo}</TableCell>
                                          <TableCell className="text-right"><CurrencyDisplay value={ob.cashupAmount} /></TableCell>
                                          {bankLines.length > 0 && (
                                            <>
                                              <TableCell
                                                className={`text-right text-sm ${!isMatched ? 'cursor-pointer' : ''} ${isDragOver ? 'bg-primary/20 ring-2 ring-primary ring-inset' : ''}`}
                                                onDragOver={!isMatched ? (e) => handleDragOver(e, obDropKey) : undefined}
                                                onDragLeave={!isMatched ? handleDragLeave : undefined}
                                                onDrop={!isMatched ? (e) => handleDrop(e, obDropKey) : undefined}
                                              >
                                                {ob.bankAmount > 0 ? (
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <span className={`${isMatched ? 'text-green-600 font-medium' : ''} underline decoration-dashed cursor-help`}>
                                                        <CurrencyDisplay value={ob.bankAmount} />
                                                      </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      <div className="text-xs space-y-1">
                                                        <div className="font-semibold mb-1">Manual matches:</div>
                                                        {obManualLines.map(ml => (
                                                          <div key={ml.idx} className="flex items-center gap-2">
                                                            <span>{ml.description} = <CurrencyDisplay value={ml.amount} /></span>
                                                            <button onClick={() => handleRemoveManualMatch(obDropKey, ml.idx)} className="text-destructive hover:text-destructive/80 text-xs font-bold">✕</button>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                ) : (
                                                  <span className={`text-xs ${isDragOver ? 'text-primary font-medium' : 'text-destructive'}`}>
                                                    {isDragOver ? '⬇ Drop here' : '—'}
                                                  </span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-right text-sm">
                                                {isMatched ? (
                                                  <span className="text-green-600 text-xs">✓</span>
                                                ) : (() => {
                                                  const obClearKey = `OB-${ob.date}`;
                                                  const cleared = isDiffCleared(obClearKey, ob.terminal);
                                                  const isSelected = selectedDiffForClearing?.date === obClearKey && selectedDiffForClearing?.terminal === ob.terminal;
                                                  return (
                                                    <button
                                                      onClick={() => handleDiffClick(obClearKey, ob.terminal, ob.diff)}
                                                      className={`cursor-pointer px-1 py-0.5 rounded transition-colors ${
                                                        cleared ? 'bg-green-100 dark:bg-green-900/30 line-through text-green-600' :
                                                        isSelected ? 'bg-primary/20 ring-2 ring-primary font-bold' :
                                                        'text-destructive font-semibold hover:bg-destructive/10'
                                                      }`}
                                                      title={cleared ? 'Click to remove clearance' : 'Click to pair with another difference'}
                                                    >
                                                      <CurrencyDisplay value={ob.diff} />
                                                      {cleared && ' ✓'}
                                                    </button>
                                                  );
                                                })()}
                                              </TableCell>
                                            </>
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                    <TableCell className="text-right border-l"><CurrencyDisplay value={ob.cashupAmount} /></TableCell>
                                  </TableRow>
                                );
                              })}
                            {/* OB subtotal */}
                            <TableRow className="bg-amber-100/50 dark:bg-amber-950/20 border-b-2 font-semibold">
                              <TableCell className="text-sm">OB Total</TableCell>
                              {visibleTerminals.map(t => {
                                const termOBRows = openingBalanceRows.filter(ob => ob.terminal === t);
                                const obCashup = termOBRows.reduce((s, ob) => s + ob.cashupAmount, 0);
                                const obBank = termOBRows.reduce((s, ob) => s + ob.bankAmount, 0);
                                const obDiff = obCashup - obBank;
                                return (
                                  <React.Fragment key={t}>
                                    <TableCell className="border-l"></TableCell>
                                    <TableCell className="text-right"><CurrencyDisplay value={obCashup} /></TableCell>
                                    {bankLines.length > 0 && (
                                      <>
                                        <TableCell className="text-right"><CurrencyDisplay value={obBank} /></TableCell>
                                        <TableCell className={`text-right ${Math.abs(obDiff) > 0.01 ? 'text-destructive' : 'text-green-600'}`}><CurrencyDisplay value={obDiff} /></TableCell>
                                      </>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                              <TableCell className="text-right border-l"><CurrencyDisplay value={openingBalanceRows.filter(ob => visibleTerminals.includes(ob.terminal)).reduce((s, ob) => s + ob.cashupAmount, 0)} /></TableCell>
                            </TableRow>
                          </>
                        )}
                        {speedpointByDate.map((r, rowIdx) => {
                          const matchData = speedpointMatches[rowIdx];
                          const allMatched = bankLines.length > 0 && visibleTerminals.every(t => {
                            const td = r.terminals[t];
                            return !td || td.total === 0 || matchData[t]?.matched;
                          });
                          return (
                            <TableRow key={r.date} className={allMatched ? 'bg-green-50 dark:bg-green-950/20' : 'hover:bg-muted/30'}>
                              <TableCell className="text-sm font-mono">{format(new Date(r.date), 'dd/MM/yyyy')}</TableCell>
                              {visibleTerminals.map(t => {
                                const td = r.terminals[t];
                                const m = matchData[t];
                                const hasBreakdown = td && (td.shopAmount > 0 && td.optAmount > 0);
                                return (
                                  <React.Fragment key={t}>
                                    <TableCell className="text-center text-sm text-muted-foreground border-l">{td?.batchNo || ''}</TableCell>
                                    <TableCell className="text-right">
                                      {td && td.total > 0 ? (
                                        hasBreakdown ? (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="cursor-help underline decoration-dotted"><CurrencyDisplay value={td.total} /></span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <div className="text-xs space-y-1">
                                                <div>Shop: <CurrencyDisplay value={td.shopAmount} /></div>
                                                <div>OPT: <CurrencyDisplay value={td.optAmount} /></div>
                                              </div>
                                            </TooltipContent>
                                          </Tooltip>
                                        ) : (
                                          <CurrencyDisplay value={td.total} />
                                        )
                                      ) : (
                                        <span className="text-muted-foreground">0</span>
                                      )}
                                    </TableCell>
                                    {bankLines.length > 0 && (() => {
                                      const dropKey = `${r.date}|${t}`;
                                      const isDropTarget = td && td.total > 0 && !m.matched;
                                      const isDragOver = dragOverTarget === dropKey;
                                      const manualLines = manualMatches[dropKey] || [];
                                      return (
                                        <>
                                          <TableCell
                                            className={`text-right text-sm ${isDropTarget ? 'cursor-pointer' : ''} ${isDragOver ? 'bg-primary/20 ring-2 ring-primary ring-inset' : ''}`}
                                            onDragOver={isDropTarget ? (e) => handleDragOver(e, dropKey) : undefined}
                                            onDragLeave={isDropTarget ? handleDragLeave : undefined}
                                            onDrop={isDropTarget ? (e) => handleDrop(e, dropKey) : undefined}
                                          >
                                            {m.bankAmount > 0 ? (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span className={`${m.matched ? 'text-green-600 font-medium' : ''} ${m.manual ? 'underline decoration-dashed cursor-help' : ''}`}>
                                                    <CurrencyDisplay value={m.bankAmount} />
                                                  </span>
                                                </TooltipTrigger>
                                                {m.manual && (
                                                  <TooltipContent>
                                                    <div className="text-xs space-y-1">
                                                      <div className="font-semibold mb-1">Manual matches:</div>
                                                      {manualLines.map(ml => (
                                                        <div key={ml.idx} className="flex items-center gap-2">
                                                          <span>{ml.description} = <CurrencyDisplay value={ml.amount} /></span>
                                                          <button onClick={() => handleRemoveManualMatch(dropKey, ml.idx)} className="text-destructive hover:text-destructive/80 text-xs font-bold">✕</button>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </TooltipContent>
                                                )}
                                              </Tooltip>
                                            ) : td && td.total > 0 ? (
                                              <span className={`text-xs ${isDragOver ? 'text-primary font-medium' : 'text-destructive'}`}>
                                                {isDragOver ? '⬇ Drop here' : '—'}
                                              </span>
                                            ) : <span className="text-muted-foreground">—</span>}
                                          </TableCell>
                                          <TableCell className="text-right text-sm">
                                            {m.bankAmount > 0 && !m.matched ? (() => {
                                              const cleared = isDiffCleared(r.date, t);
                                              const isSelected = selectedDiffForClearing?.date === r.date && selectedDiffForClearing?.terminal === t;
                                              return (
                                                <button
                                                  onClick={() => handleDiffClick(r.date, t, m.diff)}
                                                  className={`cursor-pointer px-1 py-0.5 rounded transition-colors ${
                                                    cleared ? 'bg-green-100 dark:bg-green-900/30 line-through text-green-600' :
                                                    isSelected ? 'bg-primary/20 ring-2 ring-primary font-bold' :
                                                    'text-destructive font-semibold hover:bg-destructive/10'
                                                  }`}
                                                  title={cleared ? 'Click to remove clearance' : 'Click to pair with another difference'}
                                                >
                                                  <CurrencyDisplay value={m.diff} />
                                                  {cleared && ' ✓'}
                                                </button>
                                              );
                                            })() : m.matched ? (
                                              <span className="text-green-600 text-xs">✓</span>
                                            ) : <span className="text-muted-foreground">—</span>}
                                          </TableCell>
                                        </>
                                      );
                                    })()}
                                  </React.Fragment>
                                );
                              })}
                              <TableCell className="text-right font-semibold border-l"><CurrencyDisplay value={selectedTerminal === 'all' ? r.total : visibleTerminals.reduce((s, t) => s + (r.terminals[t]?.total ?? 0), 0)} /></TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-secondary font-semibold border-t-2">
                          <TableCell>TOTAL (incl. OB)</TableCell>
                          {visibleTerminals.map(t => {
                            const obRows = openingBalanceRows.filter(ob => ob.terminal === t);
                            const obCashup = obRows.reduce((s, ob) => s + ob.cashupAmount, 0);
                            const obBank = obRows.reduce((s, ob) => s + ob.bankAmount, 0);
                            const cashupColTotal = (spColumnTotals[t] ?? 0) + obCashup;
                            const bankColTotal = speedpointMatches.reduce((s, rm) => s + (rm[t]?.bankAmount ?? 0), 0) + obBank;
                            const diffColTotal = cashupColTotal - bankColTotal;
                            return (
                              <React.Fragment key={t}>
                                <TableCell className="border-l"></TableCell>
                                <TableCell className="text-right"><CurrencyDisplay value={cashupColTotal} highlight /></TableCell>
                                {bankLines.length > 0 && (
                                  <>
                                    <TableCell className="text-right"><CurrencyDisplay value={bankColTotal} /></TableCell>
                                    <TableCell className={`text-right ${Math.abs(diffColTotal) > 0.01 ? 'text-destructive' : 'text-green-600'}`}>
                                      <CurrencyDisplay value={diffColTotal} />
                                    </TableCell>
                                  </>
                                )}
                              </React.Fragment>
                            );
                          })}
                          <TableCell className="text-right border-l"><CurrencyDisplay value={(selectedTerminal === 'all' ? spGrandTotal : visibleTerminals.reduce((s, t) => s + (spColumnTotals[t] ?? 0), 0)) + openingBalanceRows.filter(ob => visibleTerminals.includes(ob.terminal)).reduce((s, ob) => s + ob.cashupAmount, 0)} highlight /></TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>

            {/* Unmatched terminal lines — right side panel */}
            {unmatchedTerminalLines.length > 0 && (
              <div className="bg-card border rounded-lg overflow-hidden w-80 flex-shrink-0 self-start sticky top-4">
                <div className="px-3 py-2 border-b bg-destructive/10">
                  <h3 className="font-semibold text-sm text-destructive">
                    Unmatched ({unmatchedTerminalLines.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">Drag to match</p>
                </div>
                <div className="max-h-[70vh] overflow-y-auto">
                  {unmatchedTerminalLines.map((l, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={(e) => handleDragStart(e, l)}
                      className="cursor-grab active:cursor-grabbing hover:bg-muted/30 border-b last:border-b-0 px-3 py-2 text-xs flex flex-col gap-0.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-muted-foreground">{l.date}</span>
                        <span className="font-semibold"><CurrencyDisplay value={l.amount} /></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">⠿</span>
                        <span className="truncate">{l.terminal} · B{l.batch}</span>
                      </div>
                    </div>
                  ))}
                  <div className="px-3 py-2 bg-secondary font-semibold text-xs flex justify-between">
                    <span>Total</span>
                    <CurrencyDisplay value={unmatchedTerminalLines.reduce((s, l) => s + l.amount, 0)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Accounts */}
        <TabsContent value="accounts">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Accounts Report — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(accountsReport, `accounts-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountsReport.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No accounts data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {accountsReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-sm">{r.cashier}</TableCell>
                        <TableCell>
                          <span className={`text-xs rounded px-1.5 py-0.5 ${r.shift === 'Shop' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>{r.shift}</span>
                        </TableCell>
                        <TableCell className="text-sm">{r.name}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.amount} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={accountsTotal} highlight /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
            {accountsReport.length > 0 && (
              <div className="border-t p-4">
                <h4 className="text-sm font-semibold mb-2">Summary by Account</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(
                    accountsReport.reduce((acc, r) => { acc[r.name] = (acc[r.name] || 0) + r.amount; return acc; }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).map(([name, total]) => (
                    <div key={name} className="flex justify-between text-sm bg-muted/30 rounded px-2 py-1">
                      <span className="text-muted-foreground truncate mr-2">{name}</span>
                      <CurrencyDisplay value={total} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Detailed Invoices — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(invoiceReport, `invoices-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Doc No.</TableHead>
                  <TableHead className="text-right">Inclusive</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceReport.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No invoice data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {invoiceReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell><span className={`text-xs rounded px-1.5 py-0.5 ${r.type === 'Payout' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{r.type}</span></TableCell>
                        <TableCell className="text-sm">{r.supplier}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.category}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.docNum}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.inclusive} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.vat} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell colSpan={5}>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={invoiceTotal} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={invoiceVatTotal} /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* MOP */}
        <TabsContent value="mop">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Method of Payment Report — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(mopReport, `mop-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Cash (CC)</TableHead>
                  <TableHead className="text-right">Shop SP</TableHead>
                  <TableHead className="text-right">OPT SP</TableHead>
                  <TableHead className="text-right">Total SP</TableHead>
                  <TableHead className="text-right">Scan to Pay</TableHead>
                  <TableHead className="text-right">V Plus</TableHead>
                  <TableHead className="text-right">Accounts</TableHead>
                  <TableHead className="text-right">Total MOP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mopReport.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {mopReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.cash} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.shopSpeedpoint} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.optSpeedpoint} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.totalSpeedpoint} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.scanToPay} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.vPlus} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.accounts} /></TableCell>
                        <TableCell className="text-right font-semibold"><CurrencyDisplay value={r.total} highlight /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.cash, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.shopSpeedpoint, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.optSpeedpoint, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.totalSpeedpoint, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.scanToPay, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.vPlus, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.accounts, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.total, 0)} highlight /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Creditors */}
        <TabsContent value="creditors">
          <CreditorsRecon filterMonth={filterMonth} />
        </TabsContent>

        {/* Airtime */}
        <TabsContent value="airtime">
          <AirtimeRecon filterMonth={filterMonth} />
        </TabsContent>

        {/* Bank Statement */}
        <TabsContent value="bank">
          <BankStatementTab filterMonth={filterMonth} monthLabel={monthLabel} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
