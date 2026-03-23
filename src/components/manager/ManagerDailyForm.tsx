import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCashupStore } from '@/store/cashupStore';
import { useMasterDataStore } from '@/store/masterDataStore';
import type { ManagerDailyEntry, InvoiceLine } from '@/types/cashup';
import { Section, DataRow, CurrencyInput, CurrencyDisplay } from '@/components/ui/CashupUI';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save, AlertCircle, CheckCircle, Lock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';

// ---- Invoice table: defined OUTSIDE the parent so React never remounts inputs on keystroke ----
interface InvoiceTableProps {
  lines: InvoiceLine[];
  supplierList: string[];
  categories: string[];
  invoiceTotal: number;
  vatTotal: number;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<InvoiceLine>) => void;
}

function InvoiceTable({ lines, supplierList, categories, invoiceTotal, vatTotal, onAdd, onRemove, onUpdate }: InvoiceTableProps) {
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
            <select value={l.supplier} onChange={e => onUpdate(l.id, { supplier: e.target.value })}
              className="input-cell w-full text-left text-xs py-0.5">
              <option value="">Select...</option>
              {supplierList.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-3">
            <select value={l.category} onChange={e => onUpdate(l.id, { category: e.target.value })}
              className="input-cell w-full text-left text-xs py-0.5">
              <option value="">Category...</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <input
              value={l.branchDocNum}
              onChange={e => onUpdate(l.id, { branchDocNum: e.target.value })}
              className="input-cell w-full text-xs py-0.5"
              placeholder="Doc#"
            />
          </div>
          <div className="col-span-2">
            <CurrencyInput value={l.inclusive} onChange={v => onUpdate(l.id, { inclusive: v })} className="w-full" />
          </div>
          <div className="col-span-1">
            <CurrencyInput value={l.vat} onChange={v => onUpdate(l.id, { vat: v })} className="w-full" />
          </div>
          <button onClick={() => onRemove(l.id)} className="text-destructive p-0.5 flex justify-center">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="px-3 py-1.5 flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={onAdd} className="text-xs h-7">
          <Plus className="h-3 w-3 mr-1" />Add Invoice
        </Button>
        <div className="flex gap-4 text-sm font-semibold">
          <span>Total: <CurrencyDisplay value={invoiceTotal} highlight /></span>
          <span>VAT: <CurrencyDisplay value={vatTotal} /></span>
        </div>
      </div>
    </>
  );
}

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
  const { payoutSuppliers: SUPPLIERS, eftSuppliers, managerNames: MANAGER_NAMES, categories: CATEGORIES } = useMasterDataStore();
  const existing = getManagerEntryByDate(selectedDate);
  const cashup = getCashupByDate(selectedDate);
  const isLocked = selectedDate < '2026-01-01';

  // Get previous day's closing balances (auto-populate opening)
  const prevDate = format(subDays(new Date(selectedDate), 1), 'yyyy-MM-dd');
  const prevEntry = getManagerEntryByDate(prevDate);
  const isFirstJan2026 = selectedDate === '2026-01-01';

  const [form, setForm] = useState<Omit<ManagerDailyEntry, 'id'>>(() => blankEntry(selectedDate));

  useEffect(() => {
    if (existing) {
      setForm({ ...existing });
    } else {
      const base = blankEntry(selectedDate);

      if (isFirstJan2026) {
        // Seed Jan 1 opening balances from original spreadsheet
        base.coinsOpeningBalance = 4483.15;
        base.easypayOpeningBalance = 3500;
        base.cashConnectOpeningBalance = 2000;
        // CC Bag Closure (EasyPay + CashConnect only — Coins column is blank)
        base.ccBagClosureEasypay = 5500;
        base.ccBagClosureCashConnect = 10000;
        // Transfer from Coins
        base.transferFromCoins = 2000;
      } else if (prevEntry) {
        // Auto-populate opening balances from previous day closing
        const prevCoinsClosing = prevEntry.coinsOpeningBalance + prevEntry.dailyCoins
          - Math.abs(prevEntry.ccBagClosureCoins)
          + prevEntry.transferFromCoins;
        const prevEasypayClosing = prevEntry.easypayOpeningBalance + prevEntry.cashDepositedEasypay
          - Math.abs(prevEntry.ccBagClosureEasypay);
        const prevCCClosing = prevEntry.cashConnectOpeningBalance + prevEntry.cashDepositedCashConnect
          - Math.abs(prevEntry.ccBagClosureCashConnect)
          - prevEntry.transferFromCoins;
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

  // Daily Cashup pulled directly from Cashier form (read-only)
  const dailyCashupCoins = cashup?.shop.coins ?? 0;
  const dailyCashupEasypay = cashup?.shop.easyPay ?? 0;
  const dailyCashupCashConnect = cashup?.shop.cashDepositedBanking ?? 0;

  // CLOSING = Opening + DailyCashup + CCBagClosure + Transfer
  const coinsClosing = form.coinsOpeningBalance + dailyCashupCoins
    - Math.abs(form.ccBagClosureCoins)
    - Math.abs(form.transferFromCoins);
  const easypayClosing = form.easypayOpeningBalance + dailyCashupEasypay
    - Math.abs(form.ccBagClosureEasypay);
  const ccClosing = form.cashConnectOpeningBalance + dailyCashupCashConnect
    - Math.abs(form.ccBagClosureCashConnect)
    + Math.abs(form.transferFromCoins);

  // 2.1 Banking — derived from CC Bag Closure Cash Connect
  const bankChargesCalc = Math.round((Math.abs(form.ccBagClosureCashConnect) / 100 * 0.3297 * 1.15) * 100) / 100;
  const bankingCalc = Math.round((Math.abs(form.ccBagClosureCashConnect) - bankChargesCalc) * 100) / 100;


  const openingIsReadOnly = !isFirstJan2026 && !!prevEntry;

  const [savedAt, setSavedAt] = useState<string | null>(null);

  const handleSave = () => {
    if (isLocked) return;
    if (existing) updateManagerEntry(existing.id, form);
    else addManagerEntry(form);
    const now = format(new Date(), 'dd MMM yyyy HH:mm:ss');
    setSavedAt(prev => prev ?? now);
    toast({ title: 'Manager entry saved', description: `Saved for ${format(new Date(selectedDate), 'dd MMM yyyy')}` });
  };

  // Cashier short/over calculations — must match CashierDailyForm exactly
  const cashierBlock = cashup ? (() => {
    const shopNetSales = cashup.shop.income - cashup.shop.returns;
    const shopPayoutsTotal = cashup.shop.payouts.reduce((s, p) => s + p.amount, 0);
    const shopTotalReceipts = cashup.shop.receipts.reduce((s, r) => s + r.amount, 0);
    const shopTotalTakings = shopNetSales - shopPayoutsTotal - cashup.shop.lottoPayouts + shopTotalReceipts;

    const cashConnectTotal = cashup.shop.cashDepositedBanking + cashup.shop.easyPay + cashup.shop.coins;
    const shopSpeedpointTotal = cashup.shop.speedpoints.reduce((s, sp) => s + sp.shopAmount, 0);
    const shopAccountTotal = cashup.shop.accounts.reduce((s, a) => s + a.amount, 0);
    const shopOtherTotal = cashup.shop.otherAdjustments.reduce((s, o) => s + o.amount, 0);
    const shopDiff = shopTotalTakings - cashConnectTotal - shopSpeedpointTotal - shopAccountTotal - shopOtherTotal - cashup.shop.returns_mop - cashup.shop.attendantShortOver;

    const optNetSales = cashup.opt.income - cashup.opt.returns;
    const optSpeedpointTotal = cashup.opt.speedpoints.reduce((s, sp) => s + sp.optAmount, 0);
    const optAccountTotal = cashup.opt.accounts.reduce((s, a) => s + a.amount, 0);
    const optDiff = optNetSales - optSpeedpointTotal - optAccountTotal;

    return { shopDiff, optDiff };
  })() : null;

  return (
    <div className="space-y-3">
      {isLocked && (
        <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/40 rounded-lg text-destructive">
          <Lock className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Period Locked — Read Only</p>
            <p className="text-xs opacity-80">Dates before 1 January 2026 are locked. No data can be posted or modified.</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-card border rounded-lg p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
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
      </div>

      {!cashup && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          No cashier data found for this date. Enter cashier sheet first to auto-populate payout vendors.
        </div>
      )}

      {/* Cashier Short / Over — at the top */}
      {cashierBlock && (
        <Section title="Cashier Short / (Over) from Cashup" color="default">
          <div className="grid grid-cols-2 gap-2 px-3 py-2">
            <DataRow label="Shop Till">
              <div className={`rounded px-2 py-0.5 text-sm font-semibold ${Math.abs(cashierBlock.shopDiff) < 0.01 ? 'status-green' : 'status-red'}`}>
                <CurrencyDisplay value={cashierBlock.shopDiff} />
              </div>
            </DataRow>
            <DataRow label="OPT">
              <div className={`rounded px-2 py-0.5 text-sm font-semibold ${Math.abs(cashierBlock.optDiff) < 0.01 ? 'status-green' : 'status-red'}`}>
                <CurrencyDisplay value={cashierBlock.optDiff} />
              </div>
            </DataRow>
          </div>
        </Section>
      )}

      {/* 1.1 Payout Invoices */}
      <Section title="1.1 Payout Invoices (to enter on branch system)" color="red">
        <InvoiceTable
          lines={form.payoutInvoices}
          supplierList={SUPPLIERS}
          categories={CATEGORIES}
          invoiceTotal={payoutInvoiceTotal}
          vatTotal={payoutVatTotal}
          onAdd={() => addInvoice('payout')}
          onRemove={id => removeInvoice(id, 'payout')}
          onUpdate={(id, patch) => updateInvoice(id, patch, 'payout')}
        />
      </Section>

      {/* 1.2 EFT / Non-Cash Invoices */}
      <Section title="1.2 EFT / Non-Cash Invoices" color="blue">
        <InvoiceTable
          lines={form.eftInvoices}
          supplierList={eftSuppliers}
          categories={CATEGORIES}
          invoiceTotal={eftInvoiceTotal}
          vatTotal={eftVatTotal}
          onAdd={() => addInvoice('eft')}
          onRemove={id => removeInvoice(id, 'eft')}
          onUpdate={(id, patch) => updateInvoice(id, patch, 'eft')}
        />
      </Section>

      {/* 1.3 Invoice Reconciliation vs Branch Day End — full width */}
      <Section title="1.3 Invoice Reconciliation vs Branch Day End" color="green">
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

      {/* 2. Cash Reconciliation — full width, below 1.3 */}
      <Section title="2. Cash Reconciliation" color="orange">
        <table className="w-full text-sm border-collapse">
          <colgroup>
            <col className="w-[32%]" />
            <col className="w-[17%]" />
            <col className="w-[17%]" />
            <col className="w-[17%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead>
            <tr className="bg-muted/40 text-xs font-semibold text-muted-foreground border-b">
              <th className="px-3 py-2 text-left font-semibold">DAILY CASH</th>
              <th className="px-3 py-2 text-center font-semibold">Coins</th>
              <th className="px-3 py-2 text-center font-semibold">Easy Pay</th>
              <th className="px-3 py-2 text-center font-semibold">Cash Connect</th>
              <th className="px-3 py-2 text-center font-semibold">TOTAL CC</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening Balance — read-only, values aligned to match input widths below */}
            <tr className="border-b">
              <td className="px-3 py-1.5 text-xs font-medium">
                <span className="flex items-center gap-1">OPENING BALANCE <Lock className="h-3 w-3 text-muted-foreground" /></span>
              </td>
              {/* Wrap in same-width container as CurrencyInput so numbers align */}
              <td className="px-3 py-1.5">
                <div className="input-cell w-full text-right bg-muted/30 text-xs py-0.5 px-1 rounded">
                  <CurrencyDisplay value={form.coinsOpeningBalance} />
                </div>
              </td>
              <td className="px-3 py-1.5">
                <div className="input-cell w-full text-right bg-muted/30 text-xs py-0.5 px-1 rounded">
                  <CurrencyDisplay value={form.easypayOpeningBalance} />
                </div>
              </td>
              <td className="px-3 py-1.5">
                <div className="input-cell w-full text-right bg-muted/30 text-xs py-0.5 px-1 rounded">
                  <CurrencyDisplay value={form.cashConnectOpeningBalance} />
                </div>
              </td>
              <td className="px-3 py-1.5">
                <div className="input-cell w-full text-right bg-muted/30 text-xs py-0.5 px-1 rounded font-semibold">
                  <CurrencyDisplay value={form.easypayOpeningBalance + form.cashConnectOpeningBalance} />
                </div>
              </td>
            </tr>

            {/* Daily Cashup — auto-populated from Cashier form, read-only */}
            <tr className="border-b bg-muted/10">
              <td className="px-3 py-1.5 text-xs text-muted-foreground">
                Daily Cashup (from Cashier Shift)
                <Lock className="h-3 w-3 text-muted-foreground inline ml-1" />
              </td>
              <td className="px-3 py-1.5">
                <div className="input-cell w-full text-right bg-muted/30 text-xs py-0.5 px-1 rounded">
                  <CurrencyDisplay value={dailyCashupCoins} />
                </div>
              </td>
              <td className="px-3 py-1.5">
                <div className="input-cell w-full text-right bg-muted/30 text-xs py-0.5 px-1 rounded">
                  <CurrencyDisplay value={dailyCashupEasypay} />
                </div>
              </td>
              <td className="px-3 py-1.5">
                <div className="input-cell w-full text-right bg-muted/30 text-xs py-0.5 px-1 rounded">
                  <CurrencyDisplay value={dailyCashupCashConnect} />
                </div>
              </td>
              <td className="px-3 py-1.5">
                <div className="input-cell w-full text-right bg-muted/30 text-xs py-0.5 px-1 rounded font-semibold">
                  <CurrencyDisplay value={dailyCashupEasypay + dailyCashupCashConnect} />
                </div>
              </td>
            </tr>

            {/* CC Bag Closure */}
            <tr className="border-b">
              <td className="px-3 py-1.5 text-xs text-muted-foreground">
                CC Bag Closure BAG no. <span className="text-destructive font-bold">(-ve)</span>
              </td>
              <td className="px-3 py-1.5 text-center text-xs text-muted-foreground align-middle">—</td>
              <td className="px-3 py-1.5">
                <CurrencyInput value={form.ccBagClosureEasypay} onChange={v => setForm(f => ({ ...f, ccBagClosureEasypay: Math.abs(v) }))} className="w-full" placeholder="0.00" />
                <div className="text-xs text-destructive text-right mt-0.5"><CurrencyDisplay value={-Math.abs(form.ccBagClosureEasypay)} /></div>
              </td>
              <td className="px-3 py-1.5">
                <CurrencyInput value={form.ccBagClosureCashConnect} onChange={v => setForm(f => ({ ...f, ccBagClosureCashConnect: Math.abs(v) }))} className="w-full" placeholder="0.00" />
                <div className="text-xs text-destructive text-right mt-0.5"><CurrencyDisplay value={-Math.abs(form.ccBagClosureCashConnect)} /></div>
              </td>
              <td className="px-3 py-1.5 text-right align-top pt-2 text-destructive font-semibold">
                <CurrencyDisplay value={-Math.abs(form.ccBagClosureEasypay) - Math.abs(form.ccBagClosureCashConnect)} />
              </td>
            </tr>

            {/* Transfer from Coins */}
            <tr className="border-b">
              <td className="px-3 py-1.5 text-xs text-muted-foreground">Transfer from Coin</td>
              <td className="px-3 py-1.5">
                <CurrencyInput value={form.transferFromCoins} onChange={v => setForm(f => ({ ...f, transferFromCoins: Math.abs(v) }))} className="w-full" placeholder="0.00" />
                <div className="text-xs text-destructive text-right mt-0.5"><CurrencyDisplay value={-Math.abs(form.transferFromCoins)} /></div>
              </td>
              <td className="px-3 py-1.5 text-center text-xs text-muted-foreground align-middle">—</td>
              <td className="px-3 py-1.5 align-middle">
                <div className="input-cell w-full text-right bg-muted/30 text-xs py-0.5 px-1 rounded text-green-700 font-semibold">
                  <CurrencyDisplay value={Math.abs(form.transferFromCoins)} />
                </div>
              </td>
              <td className="px-3 py-1.5 text-center text-xs text-muted-foreground align-middle">—</td>
            </tr>

            {/* Closing Balance */}
            <tr className="bg-secondary font-semibold border-t-2">
              <td className="px-3 py-2 rounded-bl-md font-bold text-xs uppercase">CLOSING BALANCE</td>
              <td className="px-3 py-2 text-right"><CurrencyDisplay value={coinsClosing} highlight /></td>
              <td className="px-3 py-2 text-right"><CurrencyDisplay value={easypayClosing} highlight /></td>
              <td className="px-3 py-2 text-right"><CurrencyDisplay value={ccClosing} highlight /></td>
              <td className="px-3 py-2 text-right rounded-br-md"><CurrencyDisplay value={easypayClosing + ccClosing} highlight /></td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* 2.1 Banking — full width, below 2 */}
      <Section title="2.1 Banking" color="blue">
        <DataRow label="Bank Charges">
          <div className="input-cell text-right bg-muted/30 text-sm px-2 py-1 rounded min-w-[120px]">
            <CurrencyDisplay value={bankChargesCalc} />
          </div>
        </DataRow>
        <DataRow label="Banking (net deposited)">
          <div className="input-cell text-right bg-muted/30 text-sm px-2 py-1 rounded min-w-[120px]">
            <CurrencyDisplay value={bankingCalc} />
          </div>
        </DataRow>
      </Section>

      {/* Save button at bottom */}
      <div className="flex flex-col items-center gap-2 pt-2 pb-4">
        <Button onClick={handleSave} size="lg" className="w-full max-w-xs" disabled={isLocked}>
          <Save className="h-4 w-4 mr-2" />Save Entry
        </Button>
        {savedAt && (
          <p className="text-xs text-muted-foreground">
            Originally saved: <span className="font-medium">{savedAt}</span>
          </p>
        )}
      </div>
    </div>
  );
}
