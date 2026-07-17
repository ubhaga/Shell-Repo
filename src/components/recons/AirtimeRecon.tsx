import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { downloadCsv } from '@/lib/csvExport';
import { parseBankStatementDate } from '@/lib/bankStatementDate';


interface AirtimeReconProps {
  filterMonth: string;
}

export function AirtimeRecon({ filterMonth }: AirtimeReconProps) {
  const { cashups, managerEntries, getMonthlyFiguresByMonth } = useCashupStore();

  const [bankLines, setBankLines] = useState<{ id: string; amount: number; description: string; transaction_date: string }[]>([]);
  const [allocations, setAllocations] = useState<{ bank_line_id: string; recon_type: string; target_name: string }[]>([]);
  const [priorBankLinesByMonth, setPriorBankLinesByMonth] = useState<Record<string, typeof bankLines>>({});
  const [priorAllocationsByMonth, setPriorAllocationsByMonth] = useState<Record<string, typeof allocations>>({});

  const SEED_MONTH = '2026-03';
  const isFirstMonth = filterMonth === SEED_MONTH;

  // All months from SEED_MONTH up to (but not including) filterMonth
  const priorMonths = useMemo(() => {
    const months: string[] = [];
    if (isFirstMonth) return months;
    const start = new Date(SEED_MONTH + '-01');
    const end = new Date(filterMonth + '-01');
    const cur = new Date(start);
    while (cur < end) {
      months.push(cur.toISOString().slice(0, 7));
      cur.setMonth(cur.getMonth() + 1);
    }
    return months;
  }, [filterMonth, isFirstMonth]);

  const loadData = useCallback(async () => {
    const bankQuery = supabase.from('bank_statement_lines').select('id, amount, description, transaction_date').eq('month', filterMonth);
    const allocQuery = supabase.from('bank_line_allocations').select('bank_line_id, recon_type, target_name').eq('month', filterMonth);
    const [bankRes, allocRes] = await Promise.all([bankQuery, allocQuery]);
    setBankLines(((bankRes as any)?.data ?? []) as typeof bankLines);
    setAllocations(((allocRes as any)?.data ?? []) as typeof allocations);

    if (priorMonths.length > 0) {
      const results = await Promise.all(priorMonths.map(async (m) => {
        const [b, a] = await Promise.all([
          supabase.from('bank_statement_lines').select('id, amount, description, transaction_date').eq('month', m),
          supabase.from('bank_line_allocations').select('bank_line_id, recon_type, target_name').eq('month', m),
        ]);
        return { m, b: ((b as any)?.data ?? []) as typeof bankLines, a: ((a as any)?.data ?? []) as typeof allocations };
      }));
      const bMap: Record<string, typeof bankLines> = {};
      const aMap: Record<string, typeof allocations> = {};
      results.forEach(r => { bMap[r.m] = r.b; aMap[r.m] = r.a; });
      setPriorBankLinesByMonth(bMap);
      setPriorAllocationsByMonth(aMap);
    }
  }, [filterMonth, priorMonths]);

  useEffect(() => { loadData(); }, [loadData]);

  const SEED_BLD = -11906.34;
  const SEED_EASYPAY = 14392.59;
  const SEED_LOTTO = -7691.21;

  // BLD commission day rule:
  //  - Before May 2026: 1st of month
  //  - From May 2026 onwards: last day of month
  const bldCommDateFor = (monthStr: string): string => {
    const mStart = startOfMonth(new Date(monthStr + '-01'));
    if (monthStr >= '2026-05') return format(endOfMonth(mStart), 'yyyy-MM-dd');
    return format(mStart, 'yyyy-MM-dd');
  };

  // Parse a bank date; if ambiguous (parsed month differs from expected month),
  // swap day/month to coerce into the expected month.
  const parseBankDate = (dateStr: string, expectedMonth?: string): string | null => {
    const iso = parseBankStatementDate(dateStr);
    if (!iso || !expectedMonth) return iso;
    if (iso.slice(0, 7) === expectedMonth) return iso;
    const [y, m, d] = iso.split('-');
    const swapped = `${y}-${d.padStart(2, '0')}-${m.padStart(2, '0')}`;
    if (swapped.slice(0, 7) === expectedMonth) {
      const dt = new Date(`${swapped}T00:00:00`);
      if (!isNaN(dt.getTime())) return swapped;
    }
    return iso;
  };

  // Helper to compute closing balances for a given month's data
  const computeClosing = (
    monthStr: string,
    lines: typeof bankLines,
    allocs: typeof allocations,
    openBld: number,
    openEp: number,
    openLt: number,
  ) => {
    const mStart = startOfMonth(new Date(monthStr + '-01'));
    const mEnd = endOfMonth(mStart);
    const mDays = eachDayOfInterval({ start: mStart, end: mEnd });
    const mCashups = new Map(
      cashups.filter(c => c.month === monthStr).map(c => [c.date, c])
    );

    const allocByLine = new Map(allocs.map(a => [a.bank_line_id, a]));
    const bldPmts = new Map<string, number>();
    const lottoPmts = new Map<string, number>();
    const flashCollections = new Map<string, number>();
    lines.forEach(line => {
      const desc = line.description.toUpperCase().trim();
      const dateStr = parseBankDate(line.transaction_date, monthStr);
      if (!dateStr) return;
      const alloc = allocByLine.get(line.id);
      const target = alloc?.target_name;
      const isBld = target === 'Blue Label' || desc.includes('BLD DO') || desc.includes('BLUE LABEL');
      const isLotto = target === 'Lotto' || desc.includes('ITHUCOLL');
      const isFlash = target === 'Flash';
      if (isBld) bldPmts.set(dateStr, (bldPmts.get(dateStr) ?? 0) + Math.abs(line.amount));
      if (isLotto) lottoPmts.set(dateStr, (lottoPmts.get(dateStr) ?? 0) + Math.abs(line.amount));
      if (isFlash) flashCollections.set(dateStr, (flashCollections.get(dateStr) ?? 0) + Math.abs(line.amount));
    });

    let bld = openBld, ep = openEp, lt = openLt;
    for (const day of mDays) {
      const ds = format(day, 'yyyy-MM-dd');
      const c = mCashups.get(ds);
      const bldInv = c ? c.shop.receipts.filter((r: any) => r.type === 'Blue Label').reduce((s: number, r: any) => s + r.amount, 0) : 0;
      const epInv = c ? c.shop.receipts.filter((r: any) => r.type === 'Easypay').reduce((s: number, r: any) => s + r.amount, 0) : 0;
      const mgrEntry = managerEntries.find(e => e.date === ds);
      const dfCC = mgrEntry?.deepFrozenCC ?? 0;
      const ltRec = c ? c.shop.receipts.filter((r: any) => r.type === 'Lotto Receipts').reduce((s: number, r: any) => s + r.amount, 0) : 0;
      const ltPay = c ? (c.shop.lottoPayouts ?? 0) : 0;
      const bldComm = ds === bldCommDateFor(monthStr) ? (mgrEntry?.blueLabelComm ?? 0) : 0;
      const epComm = mgrEntry?.easypayComm ?? 0;
      const ltComm = mgrEntry?.lottoComm ?? 0;
      bld = bld - bldInv + (bldPmts.get(ds) ?? 0) + bldComm;
      ep = ep - (epInv + dfCC) + (c?.shop.easyPay ?? 0) + (flashCollections.get(ds) ?? 0) + epComm;
      lt = lt - (ltRec - ltPay) + (lottoPmts.get(ds) ?? 0) + ltComm;
    }
    return { bld, ep, lt };
  };

  // Compute opening balances
  const openingBalances = useMemo(() => {
    if (isFirstMonth) return { bld: SEED_BLD, ep: SEED_EASYPAY, lt: SEED_LOTTO };
    const prevClosing = computeClosing(prevMonth, prevBankLines, prevAllocations, SEED_BLD, SEED_EASYPAY, SEED_LOTTO);
    return prevClosing;
  }, [isFirstMonth, prevMonth, prevBankLines, prevAllocations, cashups, managerEntries]);

  const monthStart = startOfMonth(new Date(filterMonth + '-01'));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const cashupByDate = new Map(
    cashups.filter(c => c.month === filterMonth).map(c => [c.date, c])
  );

  const allocByLine = new Map(allocations.map(a => [a.bank_line_id, a]));
  const bldPaymentsByDate = new Map<string, number>();
  const lottoPaymentsByDate = new Map<string, number>();
  const flashCollectionsByDate = new Map<string, number>();
  bankLines.forEach(line => {
    const desc = line.description.toUpperCase().trim();
    const dateStr = parseBankDate(line.transaction_date, filterMonth);
    if (!dateStr) return;
    const target = allocByLine.get(line.id)?.target_name;
    const isBld = target === 'Blue Label' || desc.includes('BLD DO') || desc.includes('BLUE LABEL');
    const isLotto = target === 'Lotto' || desc.includes('ITHUCOLL');
    const isFlash = target === 'Flash';
    if (isBld) bldPaymentsByDate.set(dateStr, (bldPaymentsByDate.get(dateStr) ?? 0) + Math.abs(line.amount));
    if (isLotto) lottoPaymentsByDate.set(dateStr, (lottoPaymentsByDate.get(dateStr) ?? 0) + Math.abs(line.amount));
    if (isFlash) flashCollectionsByDate.set(dateStr, (flashCollectionsByDate.get(dateStr) ?? 0) + Math.abs(line.amount));
  });

  type DayRow = {
    date: string;
    bldInvoice: number;
    bldPayment: number;
    easypayInvoice: number;
    easypayCollection: number;
    lottoInvoice: number;
    lottoPayment: number;
    // Commission amounts shown separately
    bldComm: number;
    epComm: number;
    ltComm: number;
  };

  const dailyRows: DayRow[] = days.map(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const cashup = cashupByDate.get(dateStr);

    const bldInvoice = cashup
      ? cashup.shop.receipts.filter(r => r.type === 'Blue Label').reduce((s, r) => s + r.amount, 0)
      : 0;
    const easypayInvoice = cashup
      ? cashup.shop.receipts.filter(r => r.type === 'Easypay').reduce((s, r) => s + r.amount, 0)
      : 0;
    const managerEntry = managerEntries.find(e => e.date === dateStr);
    const deepFrozenCC = managerEntry?.deepFrozenCC ?? 0;
    const bldComm = dateStr === bldCommDateFor(filterMonth) ? (managerEntry?.blueLabelComm ?? 0) : 0;
    const epComm = managerEntry?.easypayComm ?? 0;
    const ltComm = managerEntry?.lottoComm ?? 0;
    const lottoReceipts = cashup
      ? cashup.shop.receipts.filter(r => r.type === 'Lotto Receipts').reduce((s, r) => s + r.amount, 0)
      : 0;
    const lottoPayouts = cashup
      ? (cashup.shop.lottoPayouts ?? 0)
      : 0;
    const lottoInvoice = lottoReceipts - lottoPayouts;

    return {
      date: dateStr,
      bldInvoice,
      bldPayment: bldPaymentsByDate.get(dateStr) ?? 0,
      easypayInvoice: easypayInvoice + deepFrozenCC,
      easypayCollection: (cashup?.shop.easyPay ?? 0) + (flashCollectionsByDate.get(dateStr) ?? 0),
      lottoInvoice,
      lottoPayment: lottoPaymentsByDate.get(dateStr) ?? 0,
      bldComm,
      epComm,
      ltComm,
    };
  });

  let bldBalance = openingBalances.bld;
  let easypayBalance = openingBalances.ep;
  let lottoBalance = openingBalances.lt;

  

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">
            Airtime / Lotto Reconciliation — {format(monthStart, 'MMMM yyyy')}
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              let bld = openingBalances.bld, ep = openingBalances.ep, lt = openingBalances.lt;
              const csvRows: any[][] = [];
              dailyRows.forEach(r => {
                bld = bld - r.bldInvoice + r.bldPayment;
                ep = ep - r.easypayInvoice + r.easypayCollection;
                lt = lt - r.lottoInvoice + r.lottoPayment;
                csvRows.push([r.date, r.bldInvoice, r.bldPayment, bld, r.easypayInvoice, r.easypayCollection, ep, r.lottoInvoice, r.lottoPayment, lt]);
                if (r.bldComm || r.epComm || r.ltComm) {
                  bld += r.bldComm; ep += r.epComm; lt += r.ltComm;
                  csvRows.push([r.date + ' (Comm)', '', r.bldComm, bld, '', r.epComm, ep, '', r.ltComm, lt]);
                }
              });
              csvRows.push(['Final Balance', '', '', bld, '', '', ep, '', '', lt]);
              downloadCsv(
                ['Date', 'BLD Invoice', 'BLD Payment', 'BLD Balance', 'Easypay Invoice', 'Easypay Collection', 'Easypay Balance', 'Lotto Invoice', 'Lotto Payment', 'Lotto Balance'],
                csvRows, `airtime-lotto-recon-${filterMonth}.csv`
              );
            }}>
              <Download className="h-3.5 w-3.5 mr-1" />Export CSV
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[80px]" rowSpan={2}>Date</TableHead>
                <TableHead colSpan={3} className="text-center border-l bg-destructive/5">
                  BLD (Creditor)
                </TableHead>
                <TableHead colSpan={3} className="text-center border-l bg-primary/5">
                  Easypay (Debtor)
                </TableHead>
                <TableHead colSpan={3} className="text-center border-l bg-accent/30">
                  Lotto (Creditor)
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="text-right text-xs border-l min-w-[90px]">+ Invoice</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">− Payment</TableHead>
                <TableHead className="text-right text-xs font-semibold min-w-[100px]">Balance</TableHead>
                <TableHead className="text-right text-xs border-l min-w-[90px]">+ Invoice</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">− Collection</TableHead>
                <TableHead className="text-right text-xs font-semibold min-w-[100px]">Balance</TableHead>
                <TableHead className="text-right text-xs border-l min-w-[90px]">+ Invoice</TableHead>
                <TableHead className="text-right text-xs min-w-[90px]">− Payment</TableHead>
                <TableHead className="text-right text-xs font-semibold min-w-[100px]">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Opening Balance */}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell className="text-xs">Opening Balance</TableCell>
                <TableCell className="border-l"></TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={openingBalances.bld} />
                </TableCell>
                <TableCell className="border-l"></TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={openingBalances.ep} />
                </TableCell>
                <TableCell className="border-l"></TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={openingBalances.lt} />
                </TableCell>
              </TableRow>
              {dailyRows.map(row => {
                bldBalance = bldBalance - row.bldInvoice + row.bldPayment;
                easypayBalance = easypayBalance - row.easypayInvoice + row.easypayCollection;
                lottoBalance = lottoBalance - row.lottoInvoice + row.lottoPayment;

                const hasData = row.bldInvoice !== 0 || row.bldPayment > 0 || row.easypayInvoice !== 0 || row.easypayCollection > 0 || row.lottoInvoice !== 0 || row.lottoPayment > 0;
                const hasComm = row.bldComm !== 0 || row.epComm !== 0 || row.ltComm !== 0;

                const dayRow = (
                  <TableRow key={row.date} className={!hasData && !hasComm ? 'opacity-50' : ''}>
                    <TableCell className="text-xs">{format(new Date(row.date), 'dd MMM (EEE)')}</TableCell>
                    <TableCell className="text-right text-xs border-l">
                      {row.bldInvoice > 0
                        ? <CurrencyDisplay value={row.bldInvoice} />
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.bldPayment > 0
                        ? <span className="text-destructive"><CurrencyDisplay value={row.bldPayment} /></span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold bg-destructive/10">
                      <CurrencyDisplay value={bldBalance} />
                    </TableCell>
                    <TableCell className="text-right text-xs border-l">
                      {row.easypayInvoice > 0
                        ? <CurrencyDisplay value={row.easypayInvoice} />
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.easypayCollection > 0
                        ? <span className="text-destructive"><CurrencyDisplay value={row.easypayCollection} /></span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold bg-primary/10">
                      <CurrencyDisplay value={easypayBalance} />
                    </TableCell>
                    <TableCell className="text-right text-xs border-l">
                      {row.lottoInvoice !== 0
                        ? <CurrencyDisplay value={row.lottoInvoice} />
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {row.lottoPayment > 0
                        ? <span className="text-destructive"><CurrencyDisplay value={row.lottoPayment} /></span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold bg-accent/20">
                      <CurrencyDisplay value={lottoBalance} />
                    </TableCell>
                  </TableRow>
                );

                // Commission row (separate from payments)
                let commRow: React.ReactNode = null;
                if (hasComm) {
                  bldBalance += row.bldComm;
                  easypayBalance += row.epComm;
                  lottoBalance += row.ltComm;
                commRow = (
                    <TableRow key={row.date + '-comm'} className="bg-blue-50 dark:bg-blue-950/20 italic border-l-4 border-l-blue-500">
                      <TableCell className="text-xs text-blue-700 dark:text-blue-400 font-semibold pl-6">↳ Commission</TableCell>
                      <TableCell className="border-l"></TableCell>
                      <TableCell className="text-right text-xs">
                        {row.bldComm !== 0
                          ? <span className="text-blue-600 dark:text-blue-400 font-semibold"><CurrencyDisplay value={row.bldComm} /></span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold bg-destructive/10">
                        <CurrencyDisplay value={bldBalance} />
                      </TableCell>
                      <TableCell className="border-l"></TableCell>
                      <TableCell className="text-right text-xs">
                        {row.epComm !== 0
                          ? <span className="text-blue-600 dark:text-blue-400 font-semibold"><CurrencyDisplay value={row.epComm} /></span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold bg-primary/10">
                        <CurrencyDisplay value={easypayBalance} />
                      </TableCell>
                      <TableCell className="border-l"></TableCell>
                      <TableCell className="text-right text-xs">
                        {row.ltComm !== 0
                          ? <span className="text-blue-600 dark:text-blue-400 font-semibold"><CurrencyDisplay value={row.ltComm} /></span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold bg-accent/20">
                        <CurrencyDisplay value={lottoBalance} />
                      </TableCell>
                    </TableRow>
                  );
                }

                return <React.Fragment key={row.date}>{dayRow}{commRow}</React.Fragment>;
              })}
              {/* Closing before commission */}
              <TableRow className="bg-secondary font-semibold">
                <TableCell className="text-xs">Closing Balance</TableCell>
                <TableCell className="text-right text-xs border-l">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.bldInvoice, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.bldPayment + r.bldComm, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={bldBalance} highlight />
                </TableCell>
                <TableCell className="text-right text-xs border-l">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.easypayInvoice, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.easypayCollection + r.epComm, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={easypayBalance} highlight />
                </TableCell>
                <TableCell className="text-right text-xs border-l">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.lottoInvoice, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.lottoPayment + r.ltComm, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={lottoBalance} highlight />
                </TableCell>
               </TableRow>
              {/* Status bar comparing with Manager Monthly Section 4 */}
              {(() => {
                const monthly = getMonthlyFiguresByMonth(filterMonth);
                const mBld = monthly?.airtimeBldBalance ?? 0;
                const mEp = monthly?.airtimeEasypayBalance ?? 0;
                const mLt = monthly?.airtimeLottoBalance ?? 0;
                const diffBld = Math.abs((-bldBalance) - mBld) < 2 ? 0 : (-bldBalance) - mBld;
                const diffEp = Math.abs(easypayBalance - mEp) < 2 ? 0 : easypayBalance - mEp;
                const diffLt = Math.abs((-lottoBalance) - mLt) < 2 ? 0 : (-lottoBalance) - mLt;
                const allMatch = diffBld === 0 && diffEp === 0 && diffLt === 0;
                const hasMonthly = !!monthly;
                return (
                  <TableRow className={allMatch && hasMonthly ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}>
                    <TableCell className="text-xs font-semibold" colSpan={1}>
                      {!hasMonthly ? '⚠️ No Monthly figures entered' : allMatch ? '✅ Matches Monthly Report' : '❌ Mismatch vs Monthly Report'}
                    </TableCell>
                    <TableCell className="border-l" colSpan={2}></TableCell>
                    <TableCell className="text-right text-xs font-semibold">
                      {hasMonthly && (
                        diffBld === 0
                          ? <span className="text-green-600">✓ Match</span>
                          : <span className="text-destructive">Diff: <CurrencyDisplay value={diffBld} /></span>
                      )}
                    </TableCell>
                    <TableCell className="border-l" colSpan={2}></TableCell>
                    <TableCell className="text-right text-xs font-semibold">
                      {hasMonthly && (
                        diffEp === 0
                          ? <span className="text-green-600">✓ Match</span>
                          : <span className="text-destructive">Diff: <CurrencyDisplay value={diffEp} /></span>
                      )}
                    </TableCell>
                    <TableCell className="border-l" colSpan={2}></TableCell>
                    <TableCell className="text-right text-xs font-semibold">
                      {hasMonthly && (
                        diffLt === 0
                          ? <span className="text-green-600">✓ Match</span>
                          : <span className="text-destructive">Diff: <CurrencyDisplay value={diffLt} /></span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
