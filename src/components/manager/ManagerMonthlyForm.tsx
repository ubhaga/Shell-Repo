import { useState, useEffect } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { useMasterDataStore } from '@/store/masterDataStore';
import type { MonthlyBranchFigures } from '@/types/cashup';
import { Section, DataRow, CurrencyInput, CurrencyDisplay } from '@/components/ui/CashupUI';
import { Button } from '@/components/ui/button';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Props { selectedDate: string; }

export function ManagerMonthlyForm({ selectedDate }: Props) {
  const month = selectedDate.slice(0, 7);
  const { getMonthlyFiguresByMonth, addMonthlyFigures, updateMonthlyFigures, cashups, managerEntries } = useCashupStore();
  const { managerNames: MANAGER_NAMES } = useMasterDataStore();
  const existing = getMonthlyFiguresByMonth(month);

  const [form, setForm] = useState<Omit<MonthlyBranchFigures, 'id'>>({
    month, enteredBy: '', branchNetSales: 0, branchTotalPayouts: 0,
    branchTotalReceipts: 0, branchTotalInvoicesCapital: 0, branchTotalInvoicesVat: 0, notes: '',
  });

  useEffect(() => {
    if (existing) setForm({ ...existing });
    else setForm(f => ({ ...f, month }));
  }, [month, existing?.id]);

  // Compute from store
  const monthCashups = cashups.filter(c => c.month === month);
  const monthManagers = managerEntries.filter(e => e.date.startsWith(month));

  const spreadsheetNetSales = monthCashups.reduce((s, c) => {
    const shopNet = c.shop.income - c.shop.returns;
    const optNet = c.opt.income - c.opt.returns;
    return s + shopNet + optNet;
  }, 0);

  const spreadsheetPayouts = monthCashups.reduce((s, c) => {
    return s + c.shop.payouts.reduce((ps, p) => ps + p.amount, 0) + c.shop.lottoPayouts;
  }, 0);

  const spreadsheetReceipts = monthCashups.reduce((s, c) =>
    s + c.shop.receipts.reduce((rs, r) => rs + r.amount, 0), 0);

  const spreadsheetInvoicesTotal = monthManagers.reduce((s, e) =>
    s + e.payoutInvoices.reduce((is, i) => is + i.inclusive, 0)
    + e.eftInvoices.reduce((is, i) => is + i.inclusive, 0), 0);

  const spreadsheetInvoicesVat = monthManagers.reduce((s, e) =>
    s + e.payoutInvoices.reduce((is, i) => is + i.vat, 0)
    + e.eftInvoices.reduce((is, i) => is + i.vat, 0), 0);

  const salesMatch = Math.abs(spreadsheetNetSales - form.branchNetSales) < 1;
  const payoutsMatch = Math.abs(spreadsheetPayouts - form.branchTotalPayouts) < 1;
  const invoicesMatch = Math.abs(spreadsheetInvoicesTotal - form.branchTotalInvoicesCapital) < 1;
  const vatMatch = Math.abs(spreadsheetInvoicesVat - form.branchTotalInvoicesVat) < 1;

  const handleSave = () => {
    if (existing) updateMonthlyFigures(existing.id, form);
    else addMonthlyFigures(form);
    toast({ title: 'Monthly figures saved', description: `Saved for ${format(new Date(month + '-01'), 'MMM yyyy')}` });
  };

  const MetricRow = ({ label, spreadsheet, branch, match }: { label: string; spreadsheet: number; branch: number; match: boolean }) => (
    <div className="grid grid-cols-4 gap-3 px-3 py-2 border-b last:border-b-0 text-sm items-center">
      <span className="text-muted-foreground col-span-1">{label}</span>
      <CurrencyDisplay value={spreadsheet} className="text-right" />
      <CurrencyDisplay value={branch} className="text-right" />
      <div className={`flex items-center justify-center gap-1 rounded px-2 py-0.5 font-semibold text-xs ${match ? 'status-green' : 'status-red'}`}>
        {match ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
        {match ? 'MATCH' : 'DIFFER'}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-card border rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Month</label>
          <div className="input-cell w-full mt-0.5 text-center font-semibold">
            {format(new Date(month + '-01'), 'MMMM yyyy')}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Entered By</label>
          <select value={form.enteredBy} onChange={e => setForm(f => ({ ...f, enteredBy: e.target.value }))}
            className="input-cell w-full mt-0.5">
            <option value="">Select...</option>
            {MANAGER_NAMES.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div className="col-span-1">
          <label className="text-xs text-muted-foreground">Notes</label>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="input-cell w-full mt-0.5 text-left" placeholder="Any month end notes..." />
        </div>
        <div className="flex items-end">
          <Button onClick={handleSave} className="w-full" size="sm">
            <Save className="h-3.5 w-3.5 mr-1" />Save Monthly
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
        Showing data for: <strong>{format(new Date(month + '-01'), 'MMMM yyyy')}</strong> — {monthCashups.length} cashup days recorded
      </div>

      {/* Monthly Summary from Spreadsheet */}
      <Section title="Monthly Totals from Spreadsheet vs Branch Report" color="blue">
        <div className="grid grid-cols-4 gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
          <span>Metric</span>
          <span className="text-right">Spreadsheet Total</span>
          <span className="text-right">Branch Report (enter below)</span>
          <span className="text-center">Status</span>
        </div>
        <MetricRow label="Net Sales" spreadsheet={spreadsheetNetSales} branch={form.branchNetSales} match={salesMatch} />
        <MetricRow label="Total Payouts" spreadsheet={spreadsheetPayouts} branch={form.branchTotalPayouts} match={payoutsMatch} />
        <MetricRow label="Total Invoices (Incl.)" spreadsheet={spreadsheetInvoicesTotal} branch={form.branchTotalInvoicesCapital} match={invoicesMatch} />
        <MetricRow label="Total VAT" spreadsheet={spreadsheetInvoicesVat} branch={form.branchTotalInvoicesVat} match={vatMatch} />
      </Section>

      {/* Branch Report Input */}
      <Section title="Enter Branch Report Figures" color="orange">
        <DataRow label="Branch Net Sales">
          <CurrencyInput value={form.branchNetSales} onChange={v => setForm(f => ({ ...f, branchNetSales: v }))} />
        </DataRow>
        <DataRow label="Branch Total Payouts">
          <CurrencyInput value={form.branchTotalPayouts} onChange={v => setForm(f => ({ ...f, branchTotalPayouts: v }))} />
        </DataRow>
        <DataRow label="Branch Total Receipts">
          <CurrencyInput value={form.branchTotalReceipts} onChange={v => setForm(f => ({ ...f, branchTotalReceipts: v }))} />
        </DataRow>
        <DataRow label="Branch Total Invoices (Incl.)">
          <CurrencyInput value={form.branchTotalInvoicesCapital} onChange={v => setForm(f => ({ ...f, branchTotalInvoicesCapital: v }))} />
        </DataRow>
        <DataRow label="Branch Total VAT">
          <CurrencyInput value={form.branchTotalInvoicesVat} onChange={v => setForm(f => ({ ...f, branchTotalInvoicesVat: v }))} />
        </DataRow>
      </Section>

      {/* Month End Status */}
      <div className={`rounded-xl border-2 p-4 text-center ${salesMatch && payoutsMatch && invoicesMatch && vatMatch ? 'border-green-500 bg-green-50' : 'border-destructive bg-destructive/5'}`}>
        <div className="text-2xl mb-1">{salesMatch && payoutsMatch && invoicesMatch && vatMatch ? '✅' : '❌'}</div>
        <div className="font-bold text-lg">{salesMatch && payoutsMatch && invoicesMatch && vatMatch ? 'Month End Reconciled' : 'Month End NOT Reconciled'}</div>
        <div className="text-sm text-muted-foreground">
          {[
            !salesMatch && 'Sales mismatch',
            !payoutsMatch && 'Payouts mismatch',
            !invoicesMatch && 'Invoices mismatch',
            !vatMatch && 'VAT mismatch',
          ].filter(Boolean).join(' • ') || 'All figures agree ✓'}
        </div>
      </div>
    </div>
  );
}
