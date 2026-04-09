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

  const [bankLines, setBankLines] = useState<{ amount: number; description: string; transaction_date: string }[]>([]);

  const loadBankLines = useCallback(async () => {
    const { data } = await supabase
      .from('bank_statement_lines')
      .select('amount, description, transaction_date')
      .eq('month', filterMonth);
    setBankLines((data ?? []) as typeof bankLines);
  }, [filterMonth]);

  useEffect(() => { loadBankLines(); }, [loadBankLines]);

  const BLD_OPENING = -11906.34;
  const EASYPAY_OPENING = 14392.59;
  const LOTTO_OPENING = 0;

  const monthStart = startOfMonth(new Date(filterMonth + '-01'));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const cashupByDate = new Map(
    cashups.filter(c => c.month === filterMonth).map(c => [c.date, c])
  );

  const parseBankDate = (dateStr: string): string | null => {
    try {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return null;
    } catch { return null; }
  };

  // BLD payments from bank
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

  // Lotto payments from bank (ITHUCOLL)
  const lottoPaymentsByDate = new Map<string, number>();
  bankLines.forEach(line => {
    const desc = line.description.toUpperCase().trim();
    if (desc.includes('ITHUCOLL')) {
      const dateStr = parseBankDate(line.transaction_date);
      if (dateStr) {
        lottoPaymentsByDate.set(dateStr, (lottoPaymentsByDate.get(dateStr) ?? 0) + Math.abs(line.amount));
      }
    }
  });

  type DayRow = {
    date: string;
    bldInvoice: number;
    bldPayment: number;
    easypayInvoice: number;
    easypayCollection: number;
    lottoInvoice: number;
    lottoPayment: number;
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
    const lottoInvoice = cashup
      ? cashup.shop.receipts.filter(r => r.type === 'Lotto Receipts').reduce((s, r) => s + r.amount, 0)
      : 0;

    return {
      date: dateStr,
      bldInvoice,
      bldPayment: bldPaymentsByDate.get(dateStr) ?? 0,
      easypayInvoice,
      easypayCollection: cashup?.shop.easyPay ?? 0,
      lottoInvoice,
      lottoPayment: lottoPaymentsByDate.get(dateStr) ?? 0,
    };
  });

  let bldBalance = BLD_OPENING;
  let easypayBalance = EASYPAY_OPENING;
  let lottoBalance = LOTTO_OPENING;

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
                  <CurrencyDisplay value={BLD_OPENING} />
                </TableCell>
                <TableCell className="border-l"></TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={EASYPAY_OPENING} />
                </TableCell>
                <TableCell className="border-l"></TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={LOTTO_OPENING} />
                </TableCell>
              </TableRow>
              {dailyRows.map(row => {
                bldBalance = bldBalance - row.bldInvoice + row.bldPayment;
                easypayBalance = easypayBalance + row.easypayInvoice - row.easypayCollection;
                // Lotto creditor: invoices increase debt, payments reduce it
                lottoBalance = lottoBalance - row.lottoInvoice + row.lottoPayment;

                const hasData = row.bldInvoice > 0 || row.bldPayment > 0 || row.easypayInvoice > 0 || row.easypayCollection > 0 || row.lottoInvoice > 0 || row.lottoPayment > 0;

                return (
                  <TableRow key={row.date} className={!hasData ? 'opacity-50' : ''}>
                    <TableCell className="text-xs">{format(new Date(row.date), 'dd MMM (EEE)')}</TableCell>
                    {/* BLD */}
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
                    {/* Easypay */}
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
                    {/* Lotto */}
                    <TableCell className="text-right text-xs border-l">
                      {row.lottoInvoice > 0
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
              })}
              {/* Closing */}
              <TableRow className="bg-secondary font-semibold">
                <TableCell className="text-xs">Closing Balance</TableCell>
                <TableCell className="text-right text-xs border-l">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.bldInvoice, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.bldPayment, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={bldBalance} highlight />
                </TableCell>
                <TableCell className="text-right text-xs border-l">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.easypayInvoice, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.easypayCollection, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={easypayBalance} highlight />
                </TableCell>
                <TableCell className="text-right text-xs border-l">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.lottoInvoice, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={dailyRows.reduce((s, r) => s + r.lottoPayment, 0)} highlight />
                </TableCell>
                <TableCell className="text-right text-xs font-bold">
                  <CurrencyDisplay value={lottoBalance} highlight />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
