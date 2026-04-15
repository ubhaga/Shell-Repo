import React, { useState, useEffect, useCallback } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay, CurrencyInput } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Save } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { downloadCsv } from '@/lib/csvExport';
import { parseBankStatementDate } from '@/lib/bankStatementDate';
import { toast } from 'sonner';

interface AirtimeReconProps {
  filterMonth: string;
}

export function AirtimeRecon({ filterMonth }: AirtimeReconProps) {
  const { cashups } = useCashupStore();

  const [bankLines, setBankLines] = useState<{ amount: number; description: string; transaction_date: string }[]>([]);
  const [commissions, setCommissions] = useState<{ bld: number; easypay: number; lotto: number }>({ bld: 0, easypay: 0, lotto: 0 });
  const [editingComm, setEditingComm] = useState<{ bld: number; easypay: number; lotto: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [bankRes, commRes] = await Promise.all([
      supabase.from('bank_statement_lines').select('amount, description, transaction_date').eq('month', filterMonth),
      supabase.from('creditor_opening_balances').select('supplier, amount').eq('month', filterMonth),
    ]);
    setBankLines((bankRes.data ?? []) as typeof bankLines);

    const commMap: Record<string, number> = {};
    ((commRes.data ?? []) as { supplier: string; amount: number }[]).forEach(r => {
      if (r.supplier.startsWith('commission:')) {
        commMap[r.supplier.replace('commission:', '')] = Number(r.amount);
      }
    });
    setCommissions({
      bld: commMap['bld'] ?? 0,
      easypay: commMap['easypay'] ?? 0,
      lotto: commMap['lotto'] ?? 0,
    });
    setEditingComm(null);
  }, [filterMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveCommissions = async () => {
    if (!editingComm) return;
    setSaving(true);
    try {
      for (const [key, val] of Object.entries(editingComm)) {
        const supplier = `commission:${key}`;
        // Check if row exists first
        const { data: existing } = await supabase
          .from('creditor_opening_balances')
          .select('id')
          .eq('month', filterMonth)
          .eq('supplier', supplier);
        if (existing && existing.length > 0) {
          const { error } = await supabase
            .from('creditor_opening_balances')
            .update({ amount: val } as never)
            .eq('id', existing[0].id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('creditor_opening_balances')
            .insert({ month: filterMonth, supplier, amount: val } as never);
          if (error) throw error;
        }
      }
      setCommissions(editingComm);
      setEditingComm(null);
      toast.success('Commissions saved');
    } catch (e) {
      console.error('Commission save error:', e);
      toast.error('Failed to save commissions');
    }
    setSaving(false);
  };

  const currentComm = editingComm ?? commissions;

  const BLD_OPENING = -11906.34;
  const EASYPAY_OPENING = 14392.59;
  const LOTTO_OPENING = 0;

  const monthStart = startOfMonth(new Date(filterMonth + '-01'));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const cashupByDate = new Map(
    cashups.filter(c => c.month === filterMonth).map(c => [c.date, c])
  );

  const parseBankDate = (dateStr: string): string | null => parseBankStatementDate(dateStr);

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
      easypayInvoice,
      easypayCollection: cashup?.shop.easyPay ?? 0,
      lottoInvoice,
      lottoPayment: lottoPaymentsByDate.get(dateStr) ?? 0,
    };
  });

  let bldBalance = BLD_OPENING;
  let easypayBalance = EASYPAY_OPENING;
  let lottoBalance = LOTTO_OPENING;

  const hasCommEdits = editingComm !== null;

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">
            Airtime / Lotto Reconciliation — {format(monthStart, 'MMMM yyyy')}
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              let bld = BLD_OPENING, ep = EASYPAY_OPENING, lt = LOTTO_OPENING;
              const csvRows = dailyRows.map(r => {
                bld = bld - r.bldInvoice + r.bldPayment;
                ep = ep - r.easypayInvoice + r.easypayCollection;
                lt = lt - r.lottoInvoice + r.lottoPayment;
                return [r.date, r.bldInvoice, r.bldPayment, bld, r.easypayInvoice, r.easypayCollection, ep, r.lottoInvoice, r.lottoPayment, lt];
              });
              csvRows.push(['Commission', '', '', currentComm.bld, '', '', currentComm.easypay, '', '', currentComm.lotto]);
              csvRows.push(['Final Balance', '', '', bld + currentComm.bld, '', '', ep + currentComm.easypay, '', '', lt + currentComm.lotto]);
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
                easypayBalance = easypayBalance - row.easypayInvoice + row.easypayCollection;
                lottoBalance = lottoBalance - row.lottoInvoice + row.lottoPayment;

                const hasData = row.bldInvoice !== 0 || row.bldPayment > 0 || row.easypayInvoice !== 0 || row.easypayCollection > 0 || row.lottoInvoice !== 0 || row.lottoPayment > 0;

                return (
                  <TableRow key={row.date} className={!hasData ? 'opacity-50' : ''}>
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
              })}
              {/* Closing before commission */}
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
              {/* Commission row */}
              <TableRow className="bg-muted/30">
                <TableCell className="text-xs font-semibold">Commission</TableCell>
                <TableCell className="border-l" colSpan={2}></TableCell>
                <TableCell className="text-right p-1">
                  <CurrencyInput
                    value={currentComm.bld}
                    onChange={(v) => setEditingComm(prev => ({ ...(prev ?? commissions), bld: v }))}
                    className="h-7 text-xs w-24 ml-auto"
                    allowNegative
                  />
                </TableCell>
                <TableCell className="border-l" colSpan={2}></TableCell>
                <TableCell className="text-right p-1">
                  <CurrencyInput
                    value={currentComm.easypay}
                    onChange={(v) => setEditingComm(prev => ({ ...(prev ?? commissions), easypay: v }))}
                    className="h-7 text-xs w-24 ml-auto"
                    allowNegative
                  />
                </TableCell>
                <TableCell className="border-l" colSpan={2}></TableCell>
                <TableCell className="text-right p-1">
                  <CurrencyInput
                    value={currentComm.lotto}
                    onChange={(v) => setEditingComm(prev => ({ ...(prev ?? commissions), lotto: v }))}
                    className="h-7 text-xs w-24 ml-auto"
                    allowNegative
                  />
                </TableCell>
              </TableRow>
              {/* Final balance after commission */}
              <TableRow className="bg-secondary/80 font-bold">
                <TableCell className="text-xs">Balance after Commission</TableCell>
                <TableCell className="border-l" colSpan={2}></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={bldBalance + currentComm.bld} highlight />
                </TableCell>
                <TableCell className="border-l" colSpan={2}></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={easypayBalance + currentComm.easypay} highlight />
                </TableCell>
                <TableCell className="border-l" colSpan={2}></TableCell>
                <TableCell className="text-right text-xs">
                  <CurrencyDisplay value={lottoBalance + currentComm.lotto} highlight />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        {hasCommEdits && (
          <div className="px-4 py-2 border-t bg-muted/30 flex justify-end">
            <Button size="sm" onClick={handleSaveCommissions} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" />Save Commissions
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
