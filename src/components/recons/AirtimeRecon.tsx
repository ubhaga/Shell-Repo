import React, { useState, useEffect, useCallback } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';

interface AirtimeReconProps {
  filterMonth: string;
}

export function AirtimeRecon({ filterMonth }: AirtimeReconProps) {
  const { cashups } = useCashupStore();

  // Bank lines for BLD payments
  const [bankLines, setBankLines] = useState<{ amount: number; description: string; transaction_date: string }[]>([]);

  const loadBankLines = useCallback(async () => {
    const { data } = await supabase
      .from('bank_statement_lines')
      .select('amount, description, transaction_date')
      .eq('month', filterMonth);
    setBankLines((data ?? []) as typeof bankLines);
  }, [filterMonth]);

  useEffect(() => { loadBankLines(); }, [loadBankLines]);

  // Opening balances (hardcoded for now)
  const BLD_OPENING = -18988.34; // creditor (negative = we owe them)
  const EASYPAY_OPENING = 14392.59; // debtor (positive = they owe us)

  // Days in the month
  const monthStart = startOfMonth(new Date(filterMonth + '-01'));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Month cashups indexed by date
  const cashupByDate = new Map(
    cashups.filter(c => c.month === filterMonth).map(c => [c.date, c])
  );

  // BLD payments from bank: match "BLD DO" in description
  const parseBankDate = (dateStr: string): string | null => {
    try {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return null;
    } catch { return null; }
  };

  const bldPaymentsByDate = new Map<string, number>();
  bankLines.forEach(line => {
    const desc = line.description.toUpperCase().trim();
    if (desc.includes('BLD DO') || desc.includes('BLUE LABEL')) {
      const dateStr = parseBankDate(line.transaction_date);
      if (dateStr) {
        bldPaymentsByDate.set(dateStr, (bldPaymentsByDate.get(dateStr) ?? 0) + Math.abs(line.amount));
      }
    }
  });

  // Build daily rows
  type DayRow = {
    date: string;
    bldPayment: number;
    easypayCollection: number; // MOP Cash - EasyPay from cashier daily
  };

  const dailyRows: DayRow[] = days.map(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const cashup = cashupByDate.get(dateStr);

    return {
      date: dateStr,
      bldPayment: bldPaymentsByDate.get(dateStr) ?? 0,
      easypayCollection: cashup?.shop.easyPay ?? 0,
    };
  });

  // Running balances
  let bldBalance = BLD_OPENING;
  let easypayBalance = EASYPAY_OPENING;

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">
            Airtime Reconciliation — {format(monthStart, 'MMMM yyyy')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[80px]">Date</TableHead>
                <TableHead colSpan={2} className="text-center border-l bg-red-50/50 dark:bg-red-950/20">
                  BLD (Creditor)
                </TableHead>
                <TableHead colSpan={2} className="text-center border-l bg-green-50/50 dark:bg-green-950/20">
                  Easypay (Debtor)
                </TableHead>
              </TableRow>
              <TableRow>
                <TableHead></TableHead>
                <TableHead className="text-right text-xs border-l text-red-600 min-w-[90px]">Payment</TableHead>
                <TableHead className="text-right text-xs font-semibold min-w-[100px]">Balance</TableHead>
                <TableHead className="text-right text-xs border-l text-green-600 min-w-[90px]">Collection</TableHead>
                <TableHead className="text-right text-xs font-semibold min-w-[100px]">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Opening Balance row */}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell className="text-xs">Opening Balance</TableCell>
                <TableCell className="border-l"></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={BLD_OPENING} />
                </TableCell>
                <TableCell className="border-l"></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={EASYPAY_OPENING} />
                </TableCell>
              </TableRow>
              {dailyRows.map(row => {
                // BLD: creditor — payments reduce the debt (add to balance since balance is negative)
                bldBalance += row.bldPayment;
                // Easypay: debtor — collections reduce what they owe (subtract from balance)
                easypayBalance -= row.easypayCollection;

                return (
                  <TableRow key={row.date}>
                    <TableCell className="text-xs">{format(new Date(row.date), 'dd MMM (EEE)')}</TableCell>
                    <TableCell className="text-right text-xs border-l">
                      {row.bldPayment > 0
                        ? <span className="text-red-600"><CurrencyDisplay value={row.bldPayment} /></span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold">
                      <CurrencyDisplay value={bldBalance} />
                    </TableCell>
                    <TableCell className="text-right text-xs border-l">
                      {row.easypayCollection > 0
                        ? <span className="text-green-600"><CurrencyDisplay value={row.easypayCollection} /></span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold">
                      <CurrencyDisplay value={easypayBalance} />
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Closing row */}
              <TableRow className="bg-secondary font-semibold">
                <TableCell className="text-xs">Closing Balance</TableCell>
                <TableCell className="text-right text-xs border-l">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.bldPayment, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={bldBalance} highlight />
                </TableCell>
                <TableCell className="text-right text-xs border-l">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.easypayCollection, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={easypayBalance} highlight />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
