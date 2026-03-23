import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCashupStore } from '@/store/cashupStore';
import { CATEGORIES } from '@/data/masterData';
import { useMasterDataStore } from '@/store/masterDataStore';
import type { ManagerDailyEntry, InvoiceLine } from '@/types/cashup';
import { Section, DataRow, CurrencyInput, CurrencyDisplay } from '@/components/ui/CashupUI';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save, AlertCircle, CheckCircle, Lock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';

const blankEntry = (date: string): Omit<ManagerDailyEntry, 'id'> => ({
  date, cashupId: '', enteredBy: '', explanations: '',
  payoutInvoices: [], eftInvoices: [],
  coinsOpeningBalance: 0, easypayOpeningBalance: 0, cashConnectOpeningBalance: 0,
  dailyCoins: 0, cashDepositedEasypay: 0, cashDepositedCashConnect: 0,
  ccBagClosureCoins: 0, ccBagClosureEasypay: 0, ccBagClosureCashConnect: 0,
  transferFromCoins: 0,
  branchDayEndTotal: 0, branchDayEndVat: 0,
  bankCharges: 0, banking: 0, locked: false,
});

interface Props { selectedDate: string; }

export function ManagerDailyForm({ selectedDate }: Props) {
  const { getManagerEntryByDate, addManagerEntry, updateManagerEntry, getCashupByDate, managerEntries } = useCashupStore();
  const { payoutSuppliers: SUPPLIERS, eftSuppliers, managerNames: MANAGER_NAMES } = useMasterDataStore();
  const existing = getManagerEntryByDate(selectedDate);
  const cashup = getCashupByDate(selectedDate);

  // Get previous day's closing balances (auto-populate opening)
  const prevDate = format(subDays(new Date(selectedDate), 1), 'yyyy-MM-dd');
  const prevEntry = getManagerEntryByDate(prevDate);
  const isFirstJan2025 = selectedDate === '2025-01-01';

  const [form, setForm] = useState<Omit<ManagerDailyEntry, 'id'>>(() => blankEntry(selectedDate));

  useEffect(() => {
    if (existing) {
      setForm({ ...existing });
    } else {
      const base = blankEntry(selectedDate);
      // Auto-populate opening balances from previous day closing (unless it's the first day)
      if (prevEntry && !isFirstJan2025) {
        const prevCoinsClosing = prevEntry.coinsOpeningBalance + prevEntry.dailyCoins
          - Math.abs(prevEntry.ccBagClosureCoins)
          + prevEntry.transferFromCoins; // transfer OUT of coins
        const prevEasypayClosing = prevEntry.easypayOpeningBalance + prevEntry.cashDepositedEasypay
          - Math.abs(prevEntry.ccBagClosureEasypay);
        const prevCCClosing = prevEntry.cashConnectOpeningBalance + prevEntry.cashDepositedCashConnect
          - Math.abs(prevEntry.ccBagClosureCashConnect)
          - prevEntry.transferFromCoins; // transfer INTO cash connect
        base.coinsOpeningBalance = prevCoinsClosing;
        base.easypayOpeningBalance = prevEasypayClosing;
        base.cashConnectOpeningBalance = prevCCClosing;
      }
      setForm(base);
    }
  }, [selectedDate, existing?.id, prevEntry?.id]);

  // Auto-populate payout invoices from cashup
  useEffect(() => {
    if (cashup && !existing) {
      const invoices: InvoiceLine[] = cashup.shop.payouts.map(p => ({
        id: uuidv4(),
        supplier: p.vendor,
        category: '',
        branchDocNum: '',
        inclusive: p.amount,
        vat: p.amount > 0 ? parseFloat((p.amount * 15 / 115).toFixed(2)) : 0,
      }));
      setForm(f => ({ ...f, payoutInvoices: invoices, cashupId: cashup.id }));
    }
  }, [cashup?.id]);

  const addInvoice = (type: 'payout' | 'eft') => {
    const line: InvoiceLine = { id: uuidv4(), supplier: '', category: '', branchDocNum: '', inclusive: 0, vat: 0 };
    if (type === 'payout') setForm(f => ({ ...f, payoutInvoices: [...f.payoutInvoices, line] }));
    else setForm(f => ({ ...f, eftInvoices: [...f.eftInvoices, line] }));
  };

  const removeInvoice = (id: string, type: 'payout' | 'eft') => {
    if (type === 'payout') setForm(f => ({ ...f, payoutInvoices: f.payoutInvoices.filter(i => i.id !== id) }));
    else setForm(f => ({ ...f, eftInvoices: f.eftInvoices.filter(i => i.id !== id) }));
  };

  const updateInvoice = (id: string, patch: Partial<InvoiceLine>, type: 'payout' | 'eft') => {
    const update = (lines: InvoiceLine[]) => lines.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, ...patch };
      if ('inclusive' in patch && !('vat' in patch)) {
        updated.vat = parseFloat((updated.inclusive * 15 / 115).toFixed(2));
      }
      return updated;
    });
    if (type === 'payout') setForm(f => ({ ...f, payoutInvoices: update(f.payoutInvoices) }));
    else setForm(f => ({ ...f, eftInvoices: update(f.eftInvoices) }));
  };

  // Calculations
  const payoutInvoiceTotal = form.payoutInvoices.reduce((s, i) => s + i.inclusive, 0);
  const payoutVatTotal = form.payoutInvoices.reduce((s, i) => s + i.vat, 0);
  const eftInvoiceTotal = form.eftInvoices.reduce((s, i) => s + i.inclusive, 0);
  const eftVatTotal = form.eftInvoices.reduce((s, i) => s + i.vat, 0);
  const totalAllInvoices = payoutInvoiceTotal + eftInvoiceTotal;
  const totalAllVat = payoutVatTotal + eftVatTotal;

  const invMatch = Math.abs(totalAllInvoices - form.branchDayEndTotal) < 0.50;
  const vatMatch = Math.abs(totalAllVat - form.branchDayEndVat) < 1.00;

  // Cash reconciliation
  // Opening = previous day closing (read-only except 1 Jan)
  // Row 2: CC Bag Closure — all values negative (user enters positive, we store/display as negative)
  // Row 3: Transfer from Coins — coins NEGATIVE (cash leaves coins), cash connect POSITIVE (cash arrives in CC)
  // Closing = Opening + Daily + CCBagClosure + Transfer
  const coinsClosing = form.coinsOpeningBalance + form.dailyCoins
    - Math.abs(form.ccBagClosureCoins)
    - Math.abs(form.transferFromCoins); // coins go out (negative)
  const easypayClosing = form.easypayOpeningBalance + form.cashDepositedEasypay
    - Math.abs(form.ccBagClosureEasypay);
  const ccClosing = form.cashConnectOpeningBalance + form.cashDepositedCashConnect
    - Math.abs(form.ccBagClosureCashConnect)
    + Math.abs(form.transferFromCoins); // cash arrives from coins (positive)

  const openingIsReadOnly = !isFirstJan2025 && !!prevEntry;

  const handleSave = () => {
    if (existing) updateManagerEntry(existing.id, form);
    else addManagerEntry(form);
    toast({ title: 'Manager entry saved', description: `Saved for ${format(new Date(selectedDate), 'dd MMM yyyy')}` });
  };

  const InvoiceTable = ({ lines, type }: { lines: InvoiceLine[], type: 'payout' | 'eft' }) => {
    const supplierList = type === 'eft' ? eftSuppliers : SUPPLIERS;
    return (
    <>
      <div className="px-3 py-1 border-b grid grid-cols-12 gap-1 text-xs text-muted-foreground font-semibold bg-muted/30">
        <span className="col-span-3">Supplier</span>
        <span className="col-span-3">Category</span>
        <span className="col-span-2">Doc No.</span>
        <span className="col-span-2 text-right">Incl.</span>
        <span className="col-span-1 text-right">VAT</span>
        <span></span>
      </div>
      {lines.map(l => (
        <div key={l.id} className="px-2 py-1 border-b grid grid-cols-12 gap-1 items-center">
          <div className="col-span-3">
            <select value={l.supplier} onChange={e => updateInvoice(l.id, { supplier: e.target.value }, type)}
              className="input-cell w-full text-left text-xs py-0.5">
              <option value="">Select...</option>
              {supplierList.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-3">
            <select value={l.category} onChange={e => updateInvoice(l.id, { category: e.target.value }, type)}
              className="input-cell w-full text-left text-xs py-0.5">
              <option value="">Category...</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <input value={l.branchDocNum} onChange={e => updateInvoice(l.id, { branchDocNum: e.target.value }, type)}
              className="input-cell w-full text-xs py-0.5" placeholder="Doc#" />
          </div>
          <div className="col-span-2">
            <CurrencyInput value={l.inclusive} onChange={v => updateInvoice(l.id, { inclusive: v }, type)} className="w-full" />
          </div>
          <div className="col-span-1">
            <CurrencyInput value={l.vat} onChange={v => updateInvoice(l.id, { vat: v }, type)} className="w-full" />
          </div>
          <button onClick={() => removeInvoice(l.id, type)} className="text-destructive p-0.5 flex justify-center">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="px-3 py-1.5 flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={() => addInvoice(type)} className="text-xs h-7">
          <Plus className="h-3 w-3 mr-1" />Add Invoice
        </Button>
        <div className="flex gap-4 text-sm font-semibold">
          <span>Total: <CurrencyDisplay value={type === 'payout' ? payoutInvoiceTotal : eftInvoiceTotal} highlight /></span>
          <span>VAT: <CurrencyDisplay value={type === 'payout' ? payoutVatTotal : eftVatTotal} /></span>
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-card border rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Entered By</label>
          <select value={form.enteredBy} onChange={e => setForm(f => ({ ...f, enteredBy: e.target.value }))}
            className="input-cell w-full mt-0.5">
            <option value="">Select manager...</option>
            {MANAGER_NAMES.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Explanations / Notes</label>
          <input value={form.explanations} onChange={e => setForm(f => ({ ...f, explanations: e.target.value }))}
            className="input-cell w-full mt-0.5 text-left" placeholder="Any notes for the day..." />
        </div>
        <div className="flex items-end">
          <Button onClick={handleSave} className="w-full" size="sm">
            <Save className="h-3.5 w-3.5 mr-1" />Save Entry
          </Button>
        </div>
      </div>

      {!cashup && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          No cashier data found for this date. Enter cashier sheet first to auto-populate payout vendors.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          {/* 1.1 Payout Invoices */}
          <Section title="1.1 Payout Invoices (to enter on branch system)" color="red">
            <InvoiceTable lines={form.payoutInvoices} type="payout" />
          </Section>

          {/* 1.2 EFT / Non-Cash Invoices */}
          <Section title="1.2 EFT / Non-Cash Invoices" color="blue">
            <InvoiceTable lines={form.eftInvoices} type="eft" />
          </Section>

          {/* Invoice totals vs Branch */}
          <Section title="Invoice Reconciliation vs Branch Day End" color="green">
            <DataRow label="Total Payout Invoices">
              <CurrencyDisplay value={payoutInvoiceTotal} />
            </DataRow>
            <DataRow label="Total EFT Invoices">
              <CurrencyDisplay value={eftInvoiceTotal} />
            </DataRow>
            <DataRow label="TOTAL ALL INVOICES" total>
              <CurrencyDisplay value={totalAllInvoices} highlight />
            </DataRow>
            <DataRow label="Total VAT" total>
              <CurrencyDisplay value={totalAllVat} />
            </DataRow>
            <div className="border-t mt-1 pt-1">
              <DataRow label="Branch Day End Total (enter)">
                <CurrencyInput value={form.branchDayEndTotal} onChange={v => setForm(f => ({ ...f, branchDayEndTotal: v }))} />
              </DataRow>
              <DataRow label="Branch Day End VAT (enter)">
                <CurrencyInput value={form.branchDayEndVat} onChange={v => setForm(f => ({ ...f, branchDayEndVat: v }))} />
              </DataRow>
              <div className="px-3 py-2 flex gap-3 text-sm">
                <div className={`flex items-center gap-1.5 rounded px-2 py-1 ${invMatch ? 'status-green' : 'status-red'}`}>
                  {invMatch ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  Total: {invMatch ? 'MATCH' : `Diff ${new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2 }).format(Math.abs(totalAllInvoices - form.branchDayEndTotal))}`}
                </div>
                <div className={`flex items-center gap-1.5 rounded px-2 py-1 ${vatMatch ? 'status-green' : 'status-red'}`}>
                  {vatMatch ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  VAT: {vatMatch ? 'MATCH' : `Diff ${new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2 }).format(Math.abs(totalAllVat - form.branchDayEndVat))}`}
                </div>
              </div>
            </div>
          </Section>
        </div>

        <div>
          {/* Cash Reconciliation */}
          <Section title="Cash Reconciliation" color="orange">
            {/* Column headers */}
            <div className="px-3 py-1 border-b grid grid-cols-4 gap-2 text-xs font-semibold text-muted-foreground bg-muted/30">
              <span></span>
              <span className="text-right">Coins</span>
              <span className="text-right">EasyPay</span>
              <span className="text-right">Cash Connect</span>
            </div>

            {/* Row 1: Opening Balance (read-only if prev day exists, except 1 Jan) */}
            <div className="px-3 py-1.5 border-b grid grid-cols-4 gap-2 items-center text-sm">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-xs">Opening Balance</span>
                {openingIsReadOnly && <Lock className="h-3 w-3 text-muted-foreground" />}
              </div>
              {openingIsReadOnly ? (
                <>
                  <div className="text-right"><CurrencyDisplay value={form.coinsOpeningBalance} /></div>
                  <div className="text-right"><CurrencyDisplay value={form.easypayOpeningBalance} /></div>
                  <div className="text-right"><CurrencyDisplay value={form.cashConnectOpeningBalance} /></div>
                </>
              ) : (
                <>
                  <CurrencyInput value={form.coinsOpeningBalance} onChange={v => setForm(f => ({ ...f, coinsOpeningBalance: v }))} />
                  <CurrencyInput value={form.easypayOpeningBalance} onChange={v => setForm(f => ({ ...f, easypayOpeningBalance: v }))} />
                  <CurrencyInput value={form.cashConnectOpeningBalance} onChange={v => setForm(f => ({ ...f, cashConnectOpeningBalance: v }))} />
                </>
              )}
            </div>

            {/* Daily Cashup sub-header */}
            <div className="px-3 py-1 border-b grid grid-cols-4 gap-2 text-xs font-semibold text-muted-foreground bg-muted/10">
              <span>Daily Cashup</span>
              <span className="text-right">Daily Coins</span>
              <span className="text-right">Cash for Easypay</span>
              <span className="text-right">Cash for CC</span>
            </div>
            <div className="px-3 py-1.5 border-b grid grid-cols-4 gap-2 items-center text-sm">
              <span className="text-muted-foreground text-xs">Deposited</span>
              <CurrencyInput value={form.dailyCoins} onChange={v => setForm(f => ({ ...f, dailyCoins: v }))} />
              <CurrencyInput value={form.cashDepositedEasypay} onChange={v => setForm(f => ({ ...f, cashDepositedEasypay: v }))} />
              <CurrencyInput value={form.cashDepositedCashConnect} onChange={v => setForm(f => ({ ...f, cashDepositedCashConnect: v }))} />
            </div>

            {/* Row 2: CC Bag Closure — all negative */}
            <div className="px-3 py-1.5 border-b grid grid-cols-4 gap-2 items-center text-sm bg-red-50/50">
              <span className="text-muted-foreground text-xs">CC Bag Closure <span className="text-destructive font-bold">(-ve)</span></span>
              <div>
                <CurrencyInput
                  value={form.ccBagClosureCoins}
                  onChange={v => setForm(f => ({ ...f, ccBagClosureCoins: Math.abs(v) }))}
                  placeholder="0.00"
                />
                <div className="text-xs text-destructive text-right">= <CurrencyDisplay value={-Math.abs(form.ccBagClosureCoins)} /></div>
              </div>
              <div>
                <CurrencyInput
                  value={form.ccBagClosureEasypay}
                  onChange={v => setForm(f => ({ ...f, ccBagClosureEasypay: Math.abs(v) }))}
                  placeholder="0.00"
                />
                <div className="text-xs text-destructive text-right">= <CurrencyDisplay value={-Math.abs(form.ccBagClosureEasypay)} /></div>
              </div>
              <div>
                <CurrencyInput
                  value={form.ccBagClosureCashConnect}
                  onChange={v => setForm(f => ({ ...f, ccBagClosureCashConnect: Math.abs(v) }))}
                  placeholder="0.00"
                />
                <div className="text-xs text-destructive text-right">= <CurrencyDisplay value={-Math.abs(form.ccBagClosureCashConnect)} /></div>
              </div>
            </div>

            {/* Row 3: Transfer from Coins */}
            <div className="px-3 py-1.5 border-b grid grid-cols-4 gap-2 items-center text-sm bg-blue-50/30">
              <span className="text-muted-foreground text-xs">Transfer from Coins</span>
              {/* Coins column: editable, must be negative */}
              <div>
                <CurrencyInput
                  value={form.transferFromCoins}
                  onChange={v => setForm(f => ({ ...f, transferFromCoins: Math.abs(v) }))}
                  placeholder="0.00"
                />
                <div className="text-xs text-destructive text-right">= <CurrencyDisplay value={-Math.abs(form.transferFromCoins)} /></div>
              </div>
              {/* EasyPay column: not applicable */}
              <div className="text-center text-xs text-muted-foreground">—</div>
              {/* Cash Connect column: same amount but positive (auto) */}
              <div className="text-right">
                <CurrencyDisplay value={Math.abs(form.transferFromCoins)} className="font-semibold text-green-700" />
                <div className="text-xs text-muted-foreground">auto (+ve)</div>
              </div>
            </div>

            {/* Closing Balance */}
            <div className="px-3 py-1.5 grid grid-cols-4 gap-2 items-center text-sm bg-secondary font-semibold rounded-b-md">
              <span>Closing Balance</span>
              <CurrencyDisplay value={coinsClosing} highlight />
              <CurrencyDisplay value={easypayClosing} highlight />
              <CurrencyDisplay value={ccClosing} highlight />
            </div>
          </Section>

          {/* Banking */}
          <Section title="Banking" color="blue">
            <DataRow label="Bank Charges">
              <CurrencyInput value={form.bankCharges} onChange={v => setForm(f => ({ ...f, bankCharges: v }))} />
            </DataRow>
            <DataRow label="Banking (net deposited)">
              <CurrencyInput value={form.banking} onChange={v => setForm(f => ({ ...f, banking: v }))} />
            </DataRow>
          </Section>

          {/* Cashier Short/Over from cashup */}
          {cashup && (() => {
            const shopNetSales = cashup.shop.income - cashup.shop.returns;
            const shopPayouts = cashup.shop.payouts.reduce((s, p) => s + p.amount, 0);
            const shopReceipts = cashup.shop.receipts.reduce((s, r) => s + r.amount, 0);
            const shopTakings = shopNetSales - shopPayouts - cashup.shop.lottoPayouts + shopReceipts;
            const shopMOP = cashup.shop.cashConnectTotal + cashup.shop.speedpoints.reduce((s, sp) => s + sp.shopAmount, 0) + cashup.shop.accounts.reduce((s, a) => s + a.amount, 0);
            const shopDiff = shopTakings - shopMOP;
            const optNetSales = cashup.opt.income - cashup.opt.returns;
            const optMOP = cashup.opt.speedpoints.reduce((s, sp) => s + sp.optAmount, 0) + cashup.opt.accounts.reduce((s, a) => s + a.amount, 0);
            const optDiff = optNetSales - optMOP;
            return (
              <Section title="Cashier Short / (Over) from Cashup" color="default">
                <DataRow label="Shop Till">
                  <div className={`rounded px-2 py-0.5 text-sm font-semibold ${Math.abs(shopDiff) < 0.01 ? 'status-green' : 'status-red'}`}>
                    <CurrencyDisplay value={shopDiff} />
                  </div>
                </DataRow>
                <DataRow label="OPT">
                  <div className={`rounded px-2 py-0.5 text-sm font-semibold ${Math.abs(optDiff) < 0.01 ? 'status-green' : 'status-red'}`}>
                    <CurrencyDisplay value={optDiff} />
                  </div>
                </DataRow>
              </Section>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
