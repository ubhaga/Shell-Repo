import React, { useState, useEffect, useCallback } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, addDays } from 'date-fns';
import type { ManagerDailyEntry } from '@/types/cashup';
import { downloadCsv } from '@/lib/csvExport';

interface CashReconProps {
  filterMonth: string;
}

// Seed values for Jan 1 2026
const SEED_DATE = '2026-01-01';
const SEED_CC = 2000;
const SEED_COINS = 4483.15;
const BANKING_OB_SEED_MONTH = '2026-03'; // first month with banking OB
const BANKING_OB_SEED = 60320.42; // outstanding from Feb

export function CashRecon({ filterMonth }: CashReconProps) {
  const { cashups, managerEntries, getCashupByDate, getManagerEntryByDate } = useCashupStore();

  type BankLine = { amount: number; description: string; transaction_date: string };
  const [bankLines, setBankLines] = useState<BankLine[]>([]);
  const [allPriorBankLines, setAllPriorBankLines] = useState<BankLine[]>([]);

  const loadBankLines = useCallback(async () => {
    const [cur, prior] = await Promise.all([
      supabase.from('bank_statement_lines').select('amount, description, transaction_date').eq('month', filterMonth),
      supabase.from('bank_statement_lines').select('amount, description, transaction_date').lt('month', filterMonth),
    ]);
    setBankLines((cur.data ?? []) as BankLine[]);
    setAllPriorBankLines((prior.data ?? []) as BankLine[]);
  }, [filterMonth]);

  useEffect(() => { loadBankLines(); }, [loadBankLines]);

  const monthStart = startOfMonth(new Date(filterMonth + '-01'));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Parse bank date from DD/MM/YYYY to YYYY-MM-DD
  const parseBankDate = (dateStr: string): string | null => {
    try {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return null;
    } catch { return null; }
  };

  // Find CCONNECT bank deposits by date
  const cconnectByDate = new Map<string, number>();
  bankLines.forEach(line => {
    const desc = line.description.toUpperCase().trim();
    if (desc.includes('CCONNECT')) {
      const dateStr = parseBankDate(line.transaction_date);
      if (dateStr) {
        cconnectByDate.set(dateStr, (cconnectByDate.get(dateStr) ?? 0) + line.amount);
      }
    }
  });

  // Compute banking opening balance: sum of all prior months' expected banking minus prior CCONNECT bank deposits
  const bankingOB = (() => {
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    // Start with seed OB for March 2026
    let ob = filterMonth >= BANKING_OB_SEED_MONTH ? BANKING_OB_SEED : 0;
    // Add all expected banking from seed month onwards, before current month
    const priorExpected = managerEntries
      .filter(e => e.date >= BANKING_OB_SEED_MONTH + '-01' && e.date < monthStartStr)
      .reduce((s, e) => s + (e.banking ?? 0), 0);
    ob += priorExpected;
    // Subtract all CCONNECT bank deposits from prior months (seed month onwards)
    let priorActual = 0;
    allPriorBankLines.forEach(line => {
      if (line.description.toUpperCase().trim().includes('CCONNECT')) {
        priorActual += line.amount;
      }
    });
    ob -= priorActual;
    return ob;
  })();

  // Compute opening balances by walking from seed date to month start
  const computeOpeningForMonth = (): { ccOpening: number; coinsOpening: number } => {
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    if (monthStartStr <= SEED_DATE) {
      return { ccOpening: SEED_CC, coinsOpening: SEED_COINS };
    }

    let cc = SEED_CC;
    let coins = SEED_COINS;

    let d = parseISO(SEED_DATE);
    const end = parseISO(monthStartStr);

    while (d < end) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const cashup = getCashupByDate(dateStr);
      const entry = getManagerEntryByDate(dateStr);

      const dailyCoins = cashup?.shop.coins ?? 0;
      const dailyCC = cashup?.shop.cashDepositedBanking ?? 0;
      const deepFrozenCC = (cashup?.shop as any)?.deepFrozenCC ?? 0;
      const closureCoins = Math.abs(entry?.ccBagClosureCoins ?? 0);
      const closureCC = Math.abs(entry?.ccBagClosureCashConnect ?? 0);
      const transferFromCoins = Math.abs(entry?.transferFromCoins ?? 0);

      coins = coins + dailyCoins - closureCoins - transferFromCoins;
      cc = cc + dailyCC - closureCC + transferFromCoins - deepFrozenCC;

      d = addDays(d, 1);
    }

    return { ccOpening: cc, coinsOpening: coins };
  };

  const { ccOpening: monthCCOpening, coinsOpening: monthCoinsOpening } = computeOpeningForMonth();

  // Build daily rows
  type DayRow = {
    date: string;
    ccOpening: number;
    ccDailyCashup: number;
    ccBagClosure: number;
    ccTransferIn: number;
    ccDeepFrozen: number;
    ccClosing: number;
    bankCharges: number;
    bankingExpected: number;
    bankActual: number;
    bankMatched: boolean;
    bankRunningBalance: number;
    coinsOpening: number;
    coinsDailyCashup: number;
    coinsBagClosure: number;
    coinsTransferOut: number;
    coinsClosing: number;
  };

  const dailyRows: DayRow[] = [];
  let runningCC = monthCCOpening;
  let runningCoins = monthCoinsOpening;
  let bankRunning = bankingOB; // start with OB from prior months

  days.forEach(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const cashup = getCashupByDate(dateStr);
    const entry = getManagerEntryByDate(dateStr);

    const ccDailyCashup = cashup?.shop.cashDepositedBanking ?? 0;
    const ccBagClosure = Math.abs(entry?.ccBagClosureCashConnect ?? 0);
    const transferFromCoins = Math.abs(entry?.transferFromCoins ?? 0);
    const deepFrozenCC = (cashup?.shop as any)?.deepFrozenCC ?? 0;
    const bankCharges = entry?.bankCharges ?? 0;
    const bankingExpected = entry?.banking ?? 0;

    const coinsDailyCashup = cashup?.shop.coins ?? 0;
    const coinsBagClosure = Math.abs(entry?.ccBagClosureCoins ?? 0);

    const ccOpening = runningCC;
    const coinsOpening = runningCoins;

    const ccClosing = ccOpening + ccDailyCashup - ccBagClosure + transferFromCoins - deepFrozenCC;
    const coinsClosing = coinsOpening + coinsDailyCashup - coinsBagClosure - transferFromCoins;

    const bankActual = cconnectByDate.get(dateStr) ?? 0;
    bankRunning = bankRunning + bankingExpected - bankActual;
    const bankMatched = bankingExpected > 0 && Math.abs(bankingExpected - bankActual) < 0.01;

    dailyRows.push({
      date: dateStr,
      ccOpening,
      ccDailyCashup,
      ccBagClosure,
      ccTransferIn: transferFromCoins,
      ccDeepFrozen: deepFrozenCC,
      ccClosing,
      bankCharges,
      bankingExpected,
      bankActual,
      bankMatched,
      bankRunningBalance: bankRunning,
      coinsOpening,
      coinsDailyCashup,
      coinsBagClosure,
      coinsTransferOut: transferFromCoins,
      coinsClosing,
    });

    runningCC = ccClosing;
    runningCoins = coinsClosing;
  });

  // Totals
  const totalCCDailyCashup = dailyRows.reduce((s, r) => s + r.ccDailyCashup, 0);
  const totalCCBagClosure = dailyRows.reduce((s, r) => s + r.ccBagClosure, 0);
  const totalCCTransferIn = dailyRows.reduce((s, r) => s + r.ccTransferIn, 0);
  const totalCCDeepFrozen = dailyRows.reduce((s, r) => s + r.ccDeepFrozen, 0);
  const totalBankCharges = dailyRows.reduce((s, r) => s + r.bankCharges, 0);
  const totalBankingExpected = dailyRows.reduce((s, r) => s + r.bankingExpected, 0);
  const totalBankActual = dailyRows.reduce((s, r) => s + r.bankActual, 0);

  const totalCoinsDailyCashup = dailyRows.reduce((s, r) => s + r.coinsDailyCashup, 0);
  const totalCoinsBagClosure = dailyRows.reduce((s, r) => s + r.coinsBagClosure, 0);
  const totalCoinsTransferOut = dailyRows.reduce((s, r) => s + r.coinsTransferOut, 0);

  return (
    <div className="space-y-6">
      {/* Cash Connect Recon */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">
            Cash Connect Reconciliation — {format(monthStart, 'MMMM yyyy')}
          </h3>
          <Button size="sm" variant="outline" onClick={() => {
            downloadCsv(
              ['Date', 'CC Opening', 'CC Daily Cashup', 'CC Transfer In', 'CC Bag Closure', 'CC Closing', 'Bank Charges', 'Expected Banking', 'Bank Stmt', 'Outstanding'],
              dailyRows.map(r => [r.date, r.ccOpening, r.ccDailyCashup, r.ccTransferIn, r.ccBagClosure, r.ccClosing, r.bankCharges, r.bankingExpected, r.bankActual, r.bankRunningBalance]),
              `cash-connect-recon-${filterMonth}.csv`
            );
          }}>
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[90px]">Date</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">Opening</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">+ Daily Cashup</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">+ Transfer In</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">− Bag Closure</TableHead>
                <TableHead className="text-right text-xs min-w-[100px] font-semibold">Closing</TableHead>
                <TableHead className="text-right text-xs border-l min-w-[80px]">Bank Charges</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">Expected Banking</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">Bank Stmt</TableHead>
                <TableHead className="text-right text-xs min-w-[100px]">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Banking Opening Balance row */}
              {bankingOB !== 0 && (
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell className="text-xs">Opening Balance</TableCell>
                  <TableCell colSpan={5}></TableCell>
                  <TableCell className="border-l"></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right text-xs font-semibold">
                    <CurrencyDisplay value={bankingOB} />
                  </TableCell>
                </TableRow>
              )}
              {dailyRows.map(row => {
                const hasData = row.ccDailyCashup > 0 || row.ccBagClosure > 0 || row.ccTransferIn > 0;

                return (
                  <TableRow key={row.date} className={!hasData ? 'opacity-50' : ''}>
                    <TableCell className="text-xs">{format(new Date(row.date), 'dd MMM (EEE)')}</TableCell>
                    <TableCell className="text-right text-xs">
                      <CurrencyDisplay value={row.ccOpening} />
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.ccDailyCashup > 0
                        ? <CurrencyDisplay value={row.ccDailyCashup} />
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.ccTransferIn > 0
                        ? <CurrencyDisplay value={row.ccTransferIn} />
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.ccBagClosure > 0
                        ? <span className="text-destructive"><CurrencyDisplay value={row.ccBagClosure} /></span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold bg-primary/10">
                      <CurrencyDisplay value={row.ccClosing} />
                    </TableCell>
                    {/* Bank matching */}
                    <TableCell className="text-right text-xs border-l">
                      {row.bankCharges > 0
                        ? <span className="text-orange-600"><CurrencyDisplay value={row.bankCharges} /></span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.bankingExpected > 0
                        ? <CurrencyDisplay value={row.bankingExpected} />
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.bankActual > 0
                        ? <CurrencyDisplay value={row.bankActual} />
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={`text-right text-xs font-semibold ${
                      Math.abs(row.bankRunningBalance) < 0.01 ? 'bg-green-100 text-green-700' :
                      'bg-destructive/10 text-destructive'
                    }`}>
                      {(row.bankingExpected > 0 || row.bankActual > 0 || Math.abs(row.bankRunningBalance) > 0.01)
                        ? (Math.abs(row.bankRunningBalance) < 0.01
                          ? '✓'
                          : <CurrencyDisplay value={row.bankRunningBalance} />)
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Closing / Totals */}
              <TableRow className="bg-secondary font-semibold">
                <TableCell className="text-xs">Totals</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={totalCCDailyCashup} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={totalCCTransferIn} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={totalCCBagClosure} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={runningCC} highlight />
                </TableCell>
                <TableCell className="text-right text-xs border-l">
                  <CurrencyDisplay value={totalBankCharges} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={totalBankingExpected} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={totalBankActual} highlight />
                </TableCell>
                <TableCell className={`text-right text-xs font-bold ${
                  Math.abs(bankRunning) < 0.01 ? 'text-green-700' : 'text-destructive'
                }`}>
                  <CurrencyDisplay value={bankRunning} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Coins Recon */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">
            Coins Reconciliation — {format(monthStart, 'MMMM yyyy')}
          </h3>
          <Button size="sm" variant="outline" onClick={() => {
            downloadCsv(
              ['Date', 'Opening', 'Daily Cashup', 'Bag Closure', 'Transfer Out', 'Closing'],
              dailyRows.map(r => [r.date, r.coinsOpening, r.coinsDailyCashup, r.coinsBagClosure, r.coinsTransferOut, r.coinsClosing]),
              `coins-recon-${filterMonth}.csv`
            );
          }}>
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[90px]">Date</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">Opening</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">+ Daily Cashup</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">− Bag Closure</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">− Transfer Out</TableHead>
                <TableHead className="text-right text-xs min-w-[100px] font-semibold">Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyRows.map(row => {
                const hasData = row.coinsDailyCashup > 0 || row.coinsBagClosure > 0 || row.coinsTransferOut > 0;

                return (
                  <TableRow key={row.date} className={!hasData ? 'opacity-50' : ''}>
                    <TableCell className="text-xs">{format(new Date(row.date), 'dd MMM (EEE)')}</TableCell>
                    <TableCell className="text-right text-xs">
                      <CurrencyDisplay value={row.coinsOpening} />
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.coinsDailyCashup > 0
                        ? <CurrencyDisplay value={row.coinsDailyCashup} />
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.coinsBagClosure > 0
                        ? <span className="text-destructive"><CurrencyDisplay value={row.coinsBagClosure} /></span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.coinsTransferOut > 0
                        ? <span className="text-destructive"><CurrencyDisplay value={row.coinsTransferOut} /></span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold bg-amber-50">
                      <CurrencyDisplay value={row.coinsClosing} />
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Totals */}
              <TableRow className="bg-secondary font-semibold">
                <TableCell className="text-xs">Totals</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={totalCoinsDailyCashup} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={totalCoinsBagClosure} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={totalCoinsTransferOut} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={runningCoins} highlight />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
