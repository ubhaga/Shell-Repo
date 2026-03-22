import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCashupStore } from '@/store/cashupStore';
import { SUPPLIERS, CASHIER_NAMES, ACCOUNTS, RECEIPT_TYPES } from '@/data/masterData';
import type { DailyCashup, PayoutLine, ReceiptLine, SpeedpointEntry, AccountEntry, OtherAdjustment } from '@/types/cashup';
import { Section, DataRow, CurrencyInput, CurrencyDisplay } from '@/components/ui/CashupUI';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const blankShopShift = (): DailyCashup['shop'] => ({
  income: 0, returns: 0,
  payouts: [], lottoPayouts: 0,
  receipts: [
    { id: uuidv4(), type: 'Blue Label', seqNo: '', amount: 0 },
    { id: uuidv4(), type: 'Easypay', seqNo: '', amount: 0 },
    { id: uuidv4(), type: 'Lotto Receipts', seqNo: '', amount: 0 },
    { id: uuidv4(), type: 'Debtors Received on Account ROA', seqNo: '', amount: 0 },
    { id: uuidv4(), type: 'Other', seqNo: '', amount: 0 },
  ],
  cashConnectTotal: 0, cashDepositedBanking: 0, easyPay: 0, coins: 0,
  speedpoints: [
    { terminal: 'Term 247608', batchNo: '', shopAmount: 0, optAmount: 0 },
    { terminal: 'Forecourt', batchNo: '', shopAmount: 0, optAmount: 0 },
    { terminal: 'Retail', batchNo: '', shopAmount: 0, optAmount: 0 },
    { terminal: 'Scan to pay', batchNo: '', shopAmount: 0, optAmount: 0 },
  ],
  accounts: [], otherAdjustments: [],
  returns_mop: 0, attendantShortOver: 0,
});

const blankOptShift = (): DailyCashup['opt'] => ({
  income: 0, returns: 0,
  speedpoints: [
    { terminal: 'Term 247608 (OPT)', batchNo: '', shopAmount: 0, optAmount: 0 },
    { terminal: 'Forecourt 2', batchNo: '', shopAmount: 0, optAmount: 0 },
    { terminal: 'V Plus', batchNo: '', shopAmount: 0, optAmount: 0 },
  ],
  accounts: [],
});

interface Props { selectedDate: string; }

export function CashierDailyForm({ selectedDate }: Props) {
  const { getCashupByDate, addCashup, updateCashup } = useCashupStore();
  const existing = getCashupByDate(selectedDate);

  const [form, setForm] = useState<Omit<DailyCashup, 'id'>>(() => ({
    date: selectedDate,
    month: selectedDate.slice(0, 7),
    enteredBy: '',
    shopShiftNumber: 0,
    optShiftNumber: 0,
    cashierName: '',
    shop: blankShopShift(),
    opt: blankOptShift(),
    locked: false,
  }));

  useEffect(() => {
    if (existing) setForm({ ...existing });
    else setForm(f => ({ ...f, date: selectedDate, month: selectedDate.slice(0, 7) }));
  }, [selectedDate, existing?.id]);

  const setShop = (patch: Partial<typeof form.shop>) =>
    setForm(f => ({ ...f, shop: { ...f.shop, ...patch } }));
  const setOpt = (patch: Partial<typeof form.opt>) =>
    setForm(f => ({ ...f, opt: { ...f.opt, ...patch } }));

  // ---- CALCULATIONS ----
  const shopPayoutsExclLotto = form.shop.payouts.reduce((s, p) => s + p.amount, 0);
  const shopNetSales = form.shop.income - form.shop.returns;
  const shopTotalReceipts = form.shop.receipts.reduce((s, r) => s + r.amount, 0);
  const shopTotalTakings = shopNetSales - shopPayoutsExclLotto - form.shop.lottoPayouts + shopTotalReceipts;

  const shopSpeedpointTotal = form.shop.speedpoints.reduce((s, sp) => s + sp.shopAmount, 0);
  const shopAccountTotal = form.shop.accounts.reduce((s, a) => s + a.amount, 0);
  const shopOtherTotal = form.shop.otherAdjustments.reduce((s, o) => s + o.amount, 0);
  const shopMopCash = form.shop.cashConnectTotal;
  const shopActualTakings = shopMopCash + shopSpeedpointTotal + shopAccountTotal + shopOtherTotal + form.shop.returns_mop + form.shop.attendantShortOver;
  const shopDifference = shopTotalTakings - shopActualTakings;

  const optNetSales = form.opt.income - form.opt.returns;
  const optSpeedpointTotal = form.opt.speedpoints.reduce((s, sp) => s + sp.optAmount, 0);
  const optAccountTotal = form.opt.accounts.reduce((s, a) => s + a.amount, 0);
  const optActualTakings = optSpeedpointTotal + optAccountTotal;
  const optDifference = optNetSales - optActualTakings;

  const handleSave = () => {
    if (existing) updateCashup(existing.id, form);
    else addCashup(form);
    toast({ title: 'Cashup saved', description: `Saved cashup for ${format(new Date(selectedDate), 'dd MMM yyyy')}` });
  };

  const addPayout = () => setShop({ payouts: [...form.shop.payouts, { id: uuidv4(), vendor: '', amount: 0 }] });
  const removePayout = (id: string) => setShop({ payouts: form.shop.payouts.filter(p => p.id !== id) });
  const updatePayout = (id: string, patch: Partial<PayoutLine>) =>
    setShop({ payouts: form.shop.payouts.map(p => p.id === id ? { ...p, ...patch } : p) });

  const updateReceipt = (id: string, patch: Partial<ReceiptLine>) =>
    setShop({ receipts: form.shop.receipts.map(r => r.id === id ? { ...r, ...patch } : r) });

  const updateSpeedpoint = (idx: number, patch: Partial<SpeedpointEntry>, shift: 'shop' | 'opt') => {
    if (shift === 'shop') {
      const sp = [...form.shop.speedpoints];
      sp[idx] = { ...sp[idx], ...patch };
      setShop({ speedpoints: sp });
    } else {
      const sp = [...form.opt.speedpoints];
      sp[idx] = { ...sp[idx], ...patch };
      setOpt({ speedpoints: sp });
    }
  };

  const addAccount = (shift: 'shop' | 'opt') => {
    const entry: AccountEntry = { id: uuidv4(), name: '', amount: 0 };
    if (shift === 'shop') setShop({ accounts: [...form.shop.accounts, entry] });
    else setOpt({ accounts: [...form.opt.accounts, entry] });
  };
  const removeAccount = (id: string, shift: 'shop' | 'opt') => {
    if (shift === 'shop') setShop({ accounts: form.shop.accounts.filter(a => a.id !== id) });
    else setOpt({ accounts: form.opt.accounts.filter(a => a.id !== id) });
  };
  const updateAccount = (id: string, patch: Partial<AccountEntry>, shift: 'shop' | 'opt') => {
    if (shift === 'shop') setShop({ accounts: form.shop.accounts.map(a => a.id === id ? { ...a, ...patch } : a) });
    else setOpt({ accounts: form.opt.accounts.map(a => a.id === id ? { ...a, ...patch } : a) });
  };

  const addOther = () => setShop({ otherAdjustments: [...form.shop.otherAdjustments, { id: uuidv4(), explanation: '', amount: 0 }] });
  const removeOther = (id: string) => setShop({ otherAdjustments: form.shop.otherAdjustments.filter(o => o.id !== id) });
  const updateOther = (id: string, patch: Partial<OtherAdjustment>) =>
    setShop({ otherAdjustments: form.shop.otherAdjustments.map(o => o.id === id ? { ...o, ...patch } : o) });

  return (
    <div className="space-y-3">
      {/* Header info */}
      <div className="bg-card border rounded-lg p-3 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Entered By</label>
          <input value={form.enteredBy} onChange={e => setForm(f => ({ ...f, enteredBy: e.target.value }))}
            className="input-cell w-full mt-0.5" placeholder="Name" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Cashier</label>
          <select value={form.cashierName} onChange={e => setForm(f => ({ ...f, cashierName: e.target.value }))}
            className="input-cell w-full mt-0.5">
            <option value="">Select...</option>
            {CASHIER_NAMES.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Shop Shift #</label>
          <input type="number" value={form.shopShiftNumber || ''} onChange={e => setForm(f => ({ ...f, shopShiftNumber: parseInt(e.target.value) || 0 }))}
            className="input-cell w-full mt-0.5" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">OPT Shift #</label>
          <input type="number" value={form.optShiftNumber || ''} onChange={e => setForm(f => ({ ...f, optShiftNumber: parseInt(e.target.value) || 0 }))}
            className="input-cell w-full mt-0.5" />
        </div>
        <div className="flex items-end">
          <Button onClick={handleSave} className="w-full" size="sm">
            <Save className="h-3.5 w-3.5 mr-1" /> Save Cashup
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SHOP TILL */}
        <div>
          <h2 className="text-base font-bold mb-2 text-primary flex items-center gap-2">
            🛒 Shop Till
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Shift {form.shopShiftNumber}</span>
          </h2>

          {/* 1. Income */}
          <Section title="1. Income" color="blue">
            <DataRow label="Income (Gross Sales)">
              <CurrencyInput value={form.shop.income} onChange={v => setShop({ income: v })} />
            </DataRow>
            <DataRow label="Returns">
              <CurrencyInput value={form.shop.returns} onChange={v => setShop({ returns: v })} />
            </DataRow>
            <DataRow label="Net Sales" total>
              <CurrencyDisplay value={shopNetSales} highlight />
            </DataRow>
          </Section>

          {/* 2. Payouts */}
          <Section title="2. Cash Payouts" color="red">
            <div className="px-3 py-1.5 text-xs text-muted-foreground grid grid-cols-3 gap-2 font-semibold border-b">
              <span>Vendor</span><span className="text-right">Amount (Incl.)</span><span></span>
            </div>
            {form.shop.payouts.map(p => (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1 border-b last:border-b-0">
                <select value={p.vendor} onChange={e => updatePayout(p.id, { vendor: e.target.value })}
                  className="input-cell flex-1 w-auto text-left">
                  <option value="">Select vendor...</option>
                  {SUPPLIERS.map(s => <option key={s}>{s}</option>)}
                </select>
                <CurrencyInput value={p.amount} onChange={v => updatePayout(p.id, { amount: v })} />
                <button onClick={() => removePayout(p.id)} className="text-destructive hover:text-destructive/70 p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="px-3 py-1.5 flex gap-2">
              <Button variant="outline" size="sm" onClick={addPayout} className="text-xs h-7">
                <Plus className="h-3 w-3 mr-1" />Add Payout
              </Button>
            </div>
            <DataRow label="Payouts Excl. Lotto" total>
              <CurrencyDisplay value={shopPayoutsExclLotto} />
            </DataRow>
            <DataRow label="Lotto Payouts Only">
              <CurrencyInput value={form.shop.lottoPayouts} onChange={v => setShop({ lottoPayouts: v })} />
            </DataRow>
          </Section>

          {/* 3. Receipts */}
          <Section title="3. Receipts" color="green">
            <div className="px-3 py-1.5 text-xs text-muted-foreground grid grid-cols-3 gap-2 font-semibold border-b">
              <span>Type</span><span>Seq No.</span><span className="text-right">Amount</span>
            </div>
            {form.shop.receipts.map(r => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-1 border-b last:border-b-0">
                <span className="text-sm text-muted-foreground flex-1">{r.type}</span>
                <input value={r.seqNo} onChange={e => updateReceipt(r.id, { seqNo: e.target.value })}
                  className="input-cell w-20" placeholder="Seq#" />
                <CurrencyInput value={r.amount} onChange={v => updateReceipt(r.id, { amount: v })} />
              </div>
            ))}
            <DataRow label="Total Receipts" total>
              <CurrencyDisplay value={shopTotalReceipts} highlight />
            </DataRow>
          </Section>

          {/* 4. Total Takings */}
          <Section title="4. Total Takings (1 - 2 + 3)" color="orange">
            <DataRow label="TOTAL TAKINGS" total>
              <CurrencyDisplay value={shopTotalTakings} highlight className="text-base" />
            </DataRow>
          </Section>

          {/* 5. MOP Cash */}
          <Section title="5. MOP Cash" color="blue">
            <DataRow label="Cash Connect Total">
              <CurrencyInput value={form.shop.cashConnectTotal} onChange={v => setShop({ cashConnectTotal: v })} />
            </DataRow>
            <DataRow label="Cash Deposited for Banking">
              <CurrencyInput value={form.shop.cashDepositedBanking} onChange={v => setShop({ cashDepositedBanking: v })} />
            </DataRow>
            <DataRow label="EasyPay">
              <CurrencyInput value={form.shop.easyPay} onChange={v => setShop({ easyPay: v })} />
            </DataRow>
            <DataRow label="Coins">
              <CurrencyInput value={form.shop.coins} onChange={v => setShop({ coins: v })} />
            </DataRow>
          </Section>

          {/* 6. MOP Speedpoints */}
          <Section title="6. MOP Speedpoints" color="purple">
            <div className="px-3 py-1.5 text-xs text-muted-foreground grid grid-cols-3 gap-2 font-semibold border-b">
              <span>Terminal</span><span>Batch No.</span><span className="text-right">Amount</span>
            </div>
            {form.shop.speedpoints.map((sp, i) => (
              <div key={sp.terminal} className="flex items-center gap-2 px-3 py-1 border-b last:border-b-0">
                <span className="text-sm flex-1">{sp.terminal}</span>
                <input value={sp.batchNo} onChange={e => updateSpeedpoint(i, { batchNo: e.target.value }, 'shop')}
                  className="input-cell w-20" placeholder="Batch#" />
                <CurrencyInput value={sp.shopAmount} onChange={v => updateSpeedpoint(i, { shopAmount: v }, 'shop')} />
              </div>
            ))}
            <DataRow label="Total Speedpoints" total>
              <CurrencyDisplay value={shopSpeedpointTotal} highlight />
            </DataRow>
          </Section>

          {/* 7. MOP Account */}
          <Section title="7. MOP Account (Debtors)" color="blue">
            {form.shop.accounts.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-1 border-b last:border-b-0">
                <select value={a.name} onChange={e => updateAccount(a.id, { name: e.target.value }, 'shop')}
                  className="input-cell flex-1 w-auto text-left">
                  <option value="">Select account...</option>
                  {ACCOUNTS.map(ac => <option key={ac}>{ac}</option>)}
                </select>
                <CurrencyInput value={a.amount} onChange={v => updateAccount(a.id, { amount: v }, 'shop')} />
                <button onClick={() => removeAccount(a.id, 'shop')} className="text-destructive p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="px-3 py-1.5">
              <Button variant="outline" size="sm" onClick={() => addAccount('shop')} className="text-xs h-7">
                <Plus className="h-3 w-3 mr-1" />Add Account
              </Button>
            </div>
            <DataRow label="Total Accounts" total><CurrencyDisplay value={shopAccountTotal} /></DataRow>
          </Section>

          {/* 8. Other */}
          <Section title="8. Other Adjustments" color="default">
            {form.shop.otherAdjustments.map(o => (
              <div key={o.id} className="flex items-center gap-2 px-3 py-1 border-b last:border-b-0">
                <input value={o.explanation} onChange={e => updateOther(o.id, { explanation: e.target.value })}
                  className="input-cell flex-1 w-auto text-left" placeholder="Explanation" />
                <CurrencyInput value={o.amount} onChange={v => updateOther(o.id, { amount: v })} />
                <button onClick={() => removeOther(o.id)} className="text-destructive p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <DataRow label="Returns (refund next day)">
              <CurrencyInput value={form.shop.returns_mop} onChange={v => setShop({ returns_mop: v })} />
            </DataRow>
            <DataRow label="Attendant Short/(Over)">
              <CurrencyInput value={form.shop.attendantShortOver} onChange={v => setShop({ attendantShortOver: v })} allowNegative />
            </DataRow>
            <div className="px-3 py-1.5">
              <Button variant="outline" size="sm" onClick={addOther} className="text-xs h-7">
                <Plus className="h-3 w-3 mr-1" />Add Adjustment
              </Button>
            </div>
          </Section>

          {/* Balance */}
          <div className={`rounded-lg p-3 border-2 ${Math.abs(shopDifference) < 0.01 ? 'border-green-500 bg-green-50' : 'border-destructive bg-destructive/5'}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">Shop Till Balance (Short/Over)</span>
              <div className="flex items-center gap-2">
                <CurrencyDisplay value={shopDifference} className="text-base font-bold" />
                {Math.abs(shopDifference) < 0.01 && <CheckCircle className="h-4 w-4 text-green-600" />}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">= Total Takings − MOP Cash − Speedpoints − Accounts − Other</p>
          </div>
        </div>

        {/* OPT */}
        <div>
          <h2 className="text-base font-bold mb-2 text-primary flex items-center gap-2">
            ⛽ OPT
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Shift {form.optShiftNumber}</span>
          </h2>

          <Section title="1. Income" color="blue">
            <DataRow label="Income (Gross Sales)">
              <CurrencyInput value={form.opt.income} onChange={v => setOpt({ income: v })} />
            </DataRow>
            <DataRow label="Returns">
              <CurrencyInput value={form.opt.returns} onChange={v => setOpt({ returns: v })} />
            </DataRow>
            <DataRow label="Net Sales" total>
              <CurrencyDisplay value={optNetSales} highlight />
            </DataRow>
          </Section>

          <Section title="6. MOP Speedpoints" color="purple">
            <div className="px-3 py-1.5 text-xs text-muted-foreground grid grid-cols-3 gap-2 font-semibold border-b">
              <span>Terminal</span><span>Batch No.</span><span className="text-right">Amount</span>
            </div>
            {form.opt.speedpoints.map((sp, i) => (
              <div key={sp.terminal} className="flex items-center gap-2 px-3 py-1 border-b last:border-b-0">
                <span className="text-sm flex-1">{sp.terminal}</span>
                <input value={sp.batchNo} onChange={e => updateSpeedpoint(i, { batchNo: e.target.value }, 'opt')}
                  className="input-cell w-20" placeholder="Batch#" />
                <CurrencyInput value={sp.optAmount} onChange={v => updateSpeedpoint(i, { optAmount: v }, 'opt')} />
              </div>
            ))}
            <DataRow label="Total Speedpoints" total>
              <CurrencyDisplay value={optSpeedpointTotal} highlight />
            </DataRow>
          </Section>

          <Section title="7. MOP Account (Debtors)" color="blue">
            {form.opt.accounts.map(a => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-1 border-b last:border-b-0">
                <select value={a.name} onChange={e => updateAccount(a.id, { name: e.target.value }, 'opt')}
                  className="input-cell flex-1 w-auto text-left">
                  <option value="">Select account...</option>
                  {ACCOUNTS.map(ac => <option key={ac}>{ac}</option>)}
                </select>
                <CurrencyInput value={a.amount} onChange={v => updateAccount(a.id, { amount: v }, 'opt')} />
                <button onClick={() => removeAccount(a.id, 'opt')} className="text-destructive p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="px-3 py-1.5">
              <Button variant="outline" size="sm" onClick={() => addAccount('opt')} className="text-xs h-7">
                <Plus className="h-3 w-3 mr-1" />Add Account
              </Button>
            </div>
            <DataRow label="Total Accounts" total><CurrencyDisplay value={optAccountTotal} /></DataRow>
          </Section>

          {/* OPT Balance */}
          <div className={`rounded-lg p-3 border-2 ${Math.abs(optDifference) < 0.01 ? 'border-green-500 bg-green-50' : 'border-destructive bg-destructive/5'}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">OPT Balance (Short/Over)</span>
              <div className="flex items-center gap-2">
                <CurrencyDisplay value={optDifference} className="text-base font-bold" />
                {Math.abs(optDifference) < 0.01 && <CheckCircle className="h-4 w-4 text-green-600" />}
              </div>
            </div>
          </div>

          {/* Combined totals */}
          <div className="mt-4 bg-card border rounded-lg p-3">
            <h3 className="font-bold text-sm mb-2">Combined Daily Totals</h3>
            <div className="grid grid-cols-3 text-sm gap-2">
              <div className="text-center p-2 bg-muted rounded">
                <div className="text-xs text-muted-foreground">Net Sales</div>
                <CurrencyDisplay value={shopNetSales + optNetSales} highlight />
              </div>
              <div className="text-center p-2 bg-muted rounded">
                <div className="text-xs text-muted-foreground">Total Speedpoints</div>
                <CurrencyDisplay value={shopSpeedpointTotal + optSpeedpointTotal} highlight />
              </div>
              <div className="text-center p-2 bg-muted rounded">
                <div className="text-xs text-muted-foreground">Total Takings</div>
                <CurrencyDisplay value={shopTotalTakings + optNetSales} highlight />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
