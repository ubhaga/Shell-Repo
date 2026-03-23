import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCashupStore } from '@/store/cashupStore';
import { RECEIPT_TYPES } from '@/data/masterData';
import { useMasterDataStore } from '@/store/masterDataStore';
import type { DailyCashup, PayoutLine, ReceiptLine, SpeedpointEntry, AccountEntry, OtherAdjustment } from '@/types/cashup';
import { Section, DataRow, CurrencyInput, CurrencyDisplay } from '@/components/ui/CashupUI';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const blankShopShift = (): DailyCashup['shop'] => ({
  income: 0, returns: 0,
  payouts: [], lottoPayouts: 0,
  receipts: RECEIPT_TYPES.map(type => ({ id: uuidv4(), type, seqNo: '', amount: 0 })),
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
    { terminal: 'Term 247608', batchNo: '', shopAmount: 0, optAmount: 0 },
    { terminal: 'Forecourt 2', batchNo: '', shopAmount: 0, optAmount: 0 },
    { terminal: 'V Plus', batchNo: '', shopAmount: 0, optAmount: 0 },
    { terminal: 'Scan to pay', batchNo: '', shopAmount: 0, optAmount: 0 },
  ],
  accounts: [],
});

interface Props { selectedDate: string; }

// Header row for two-column sections
function ColHeader({ left, right }: { left: string; right: string }) {
  return (
    <div className="grid grid-cols-2 border-b">
      <div className="px-3 py-1.5 text-xs font-bold text-white bg-primary/80 border-r">{left}</div>
      <div className="px-3 py-1.5 text-xs font-bold text-white bg-primary/60">{right}</div>
    </div>
  );
}

export function CashierDailyForm({ selectedDate }: Props) {
  const { getCashupByDate, addCashup, updateCashup } = useCashupStore();
  const { payoutSuppliers, accounts: ACCOUNTS, cashierNames: CASHIER_NAMES } = useMasterDataStore();
  const SUPPLIERS = payoutSuppliers;
  const existing = getCashupByDate(selectedDate);
  const isLocked = selectedDate < '2026-01-01';

  const [form, setForm] = useState<Omit<DailyCashup, 'id'>>(() => ({
    date: selectedDate,
    month: selectedDate.slice(0, 7),
    enteredBy: '',
    shopShiftNumber: 0,
    optShiftNumber: 0,
    cashierName: '',
    shop: blankShopShift(),
    opt: blankOptShift(),
    notes: '',
    locked: false,
  }));

  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setForm({ ...existing });
    } else {
      const shopBase = blankShopShift();
      // Seed Jan 1 2026 MOP Cash from spreadsheet (Daily Cashup row)
      if (selectedDate === '2026-01-01') {
        shopBase.coins = 54;
        shopBase.easyPay = 2000;
        shopBase.cashDepositedBanking = 13110;
        shopBase.cashConnectTotal = 54 + 2000 + 13110; // 15164
      }
      setForm(f => ({ ...f, date: selectedDate, month: selectedDate.slice(0, 7), shop: shopBase, opt: blankOptShift() }));
    }
    setSavedAt(null);
  }, [selectedDate, existing?.id]);

  const setShop = (patch: Partial<typeof form.shop>) =>
    setForm(f => ({ ...f, shop: { ...f.shop, ...patch } }));
  const setOpt = (patch: Partial<typeof form.opt>) =>
    setForm(f => ({ ...f, opt: { ...f.opt, ...patch } }));

  // ---- CALCULATIONS ----
  const shopPayoutsTotal = form.shop.payouts.reduce((s, p) => s + p.amount, 0);
  const shopNetSales = form.shop.income - form.shop.returns;
  const shopTotalReceipts = form.shop.receipts.reduce((s, r) => s + r.amount, 0);
  const shopTotalTakings = shopNetSales - shopPayoutsTotal - form.shop.lottoPayouts + shopTotalReceipts;

  const optNetSales = form.opt.income - form.opt.returns;
  // OPT Total Takings = Net Sales only (no payouts/receipts for OPT)
  const optTotalTakings = optNetSales;

  const combinedTotalTakings = shopTotalTakings + optTotalTakings;

  const shopSpeedpointTotal = form.shop.speedpoints.reduce((s, sp) => s + sp.shopAmount, 0);
  const optSpeedpointTotal = form.opt.speedpoints.reduce((s, sp) => s + sp.optAmount, 0);

  const shopAccountTotal = form.shop.accounts.reduce((s, a) => s + a.amount, 0);
  const optAccountTotal = form.opt.accounts.reduce((s, a) => s + a.amount, 0);

  const shopOtherTotal = form.shop.otherAdjustments.reduce((s, o) => s + o.amount, 0);

  // MOP Cash: Cash Connect Total = sum of the 3 sub-items
  const cashConnectTotal = form.shop.cashDepositedBanking + form.shop.easyPay + form.shop.coins;

  // Shop balance = Shop Takings - MOP Cash - Shop Speedpoints - Shop Accounts - Other adjustments
  const shopDifference = shopTotalTakings - cashConnectTotal - shopSpeedpointTotal - shopAccountTotal - shopOtherTotal - form.shop.returns_mop - form.shop.attendantShortOver;
  // OPT balance = OPT Takings - OPT Speedpoints - OPT Accounts
  const optDifference = optTotalTakings - optSpeedpointTotal - optAccountTotal;

  const handleSave = () => {
    if (isLocked) return;
    if (existing) updateCashup(existing.id, form);
    else addCashup(form);
    const now = format(new Date(), 'dd MMM yyyy, HH:mm:ss');
    setSavedAt(prev => prev ?? now);
    toast({ title: 'Cashup saved', description: `Saved for ${format(new Date(selectedDate), 'dd MMM yyyy')}` });
  };

  const addPayout = () => setShop({ payouts: [...form.shop.payouts, { id: uuidv4(), vendor: '', amount: 0 }] });
  const removePayout = (id: string) => setShop({ payouts: form.shop.payouts.filter(p => p.id !== id) });
  const updatePayout = (id: string, patch: Partial<PayoutLine>) =>
    setShop({ payouts: form.shop.payouts.map(p => p.id === id ? { ...p, ...patch } : p) });

  const updateReceipt = (id: string, patch: Partial<ReceiptLine>) =>
    setShop({ receipts: form.shop.receipts.map(r => r.id === id ? { ...r, ...patch } : r) });

  const updateShopSpeedpoint = (idx: number, patch: Partial<SpeedpointEntry>) => {
    const sp = [...form.shop.speedpoints];
    sp[idx] = { ...sp[idx], ...patch };
    setShop({ speedpoints: sp });
  };
  const updateOptSpeedpoint = (idx: number, patch: Partial<SpeedpointEntry>) => {
    const sp = [...form.opt.speedpoints];
    sp[idx] = { ...sp[idx], ...patch };
    setOpt({ speedpoints: sp });
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

  const ShortOverBadge = ({ diff }: { diff: number }) => {
    const balanced = Math.abs(diff) < 0.01;
    return (
      <div className={`flex items-center gap-2 rounded px-3 py-1 text-sm font-bold ${balanced ? 'bg-green-100 text-green-800 border border-green-400' : 'bg-red-100 text-red-800 border border-red-400'}`}>
        {balanced ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        <CurrencyDisplay value={diff} className="font-bold" />
        <span className="text-xs">{balanced ? 'BALANCED' : 'SHORT/OVER'}</span>
      </div>
    );
  };

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
          <span className="text-xs text-muted-foreground italic">Use the Save button below ↓</span>
        </div>
      </div>

      {/* Shift headers */}
      <div className="grid grid-cols-2 gap-0 rounded-lg overflow-hidden border">
        <div className="bg-primary text-primary-foreground px-4 py-2 font-bold text-sm text-center">
          🛒 SHOP TILL — Shift {form.shopShiftNumber}
        </div>
        <div className="bg-primary/80 text-primary-foreground px-4 py-2 font-bold text-sm text-center border-l border-primary-foreground/20">
          ⛽ OPT — Shift {form.optShiftNumber}
        </div>
      </div>

      {/* ─── SECTION 1: INCOME ─── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-blue-600 text-white px-3 py-2 font-semibold text-sm">1. Income</div>
        <ColHeader left="Shop Till" right="OPT" />
        <div className="grid grid-cols-2 divide-x">
          {/* Shop income */}
          <div>
            <div className="flex items-center justify-between px-3 py-1.5 border-b text-sm">
              <span className="text-muted-foreground">Income (Gross Sales)</span>
              <CurrencyInput value={form.shop.income} onChange={v => setShop({ income: v })} />
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 border-b text-sm">
              <span className="text-muted-foreground">Returns</span>
              <CurrencyInput value={form.shop.returns} onChange={v => setShop({ returns: v })} />
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 bg-secondary text-sm font-semibold">
              <span>Net Sales</span>
              <CurrencyDisplay value={shopNetSales} highlight />
            </div>
          </div>
          {/* OPT income */}
          <div>
            <div className="flex items-center justify-between px-3 py-1.5 border-b text-sm">
              <span className="text-muted-foreground">Income (Gross Sales)</span>
              <CurrencyInput value={form.opt.income} onChange={v => setOpt({ income: v })} />
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 border-b text-sm">
              <span className="text-muted-foreground">Returns</span>
              <CurrencyInput value={form.opt.returns} onChange={v => setOpt({ returns: v })} />
            </div>
            <div className="flex items-center justify-between px-3 py-1.5 bg-secondary text-sm font-semibold">
              <span>Net Sales</span>
              <CurrencyDisplay value={optNetSales} highlight />
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: PAYOUTS (Shop only) ─── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-red-600 text-white px-3 py-2 font-semibold text-sm">2. Cash Payouts — Shop Till Only</div>
        <div className="px-3 py-1 text-xs text-muted-foreground grid grid-cols-3 gap-2 font-semibold border-b bg-muted/30">
          <span>Vendor</span><span className="text-right col-span-1">Amount (Incl.)</span><span></span>
        </div>
        {form.shop.payouts.map(p => (
          <div key={p.id} className="flex items-center gap-2 px-3 py-1 border-b">
            <select value={p.vendor} onChange={e => updatePayout(p.id, { vendor: e.target.value })}
              className="input-cell flex-1 text-left text-sm">
              <option value="">Select vendor...</option>
              {SUPPLIERS.map(s => <option key={s}>{s}</option>)}
            </select>
            <CurrencyInput value={p.amount} onChange={v => updatePayout(p.id, { amount: v })} />
            <button onClick={() => removePayout(p.id)} className="text-destructive hover:text-destructive/70 p-1">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="px-3 py-1.5 flex items-center justify-between border-b">
          <Button variant="outline" size="sm" onClick={addPayout} className="text-xs h-7">
            <Plus className="h-3 w-3 mr-1" />Add Payout
          </Button>
          <div className="flex gap-4 text-sm font-semibold pr-8">
            <span className="text-muted-foreground">Payouts (excl. Lotto):</span>
            <CurrencyDisplay value={shopPayoutsTotal} />
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">Lotto Payouts Only</span>
          <CurrencyInput value={form.shop.lottoPayouts} onChange={v => setShop({ lottoPayouts: v })} />
        </div>
      </div>

      {/* ─── SECTION 3: RECEIPTS (Shop only) ─── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-green-700 text-white px-3 py-2 font-semibold text-sm">3. Receipts — Shop Till Only</div>
        <div className="px-3 py-1 text-xs text-muted-foreground grid grid-cols-12 gap-2 font-semibold border-b bg-muted/30">
          <span className="col-span-7">Type</span><span className="col-span-2">Seq No.</span><span className="col-span-3 text-right">Amount</span>
        </div>
        {form.shop.receipts.map(r => (
          <div key={r.id} className="grid grid-cols-12 items-center gap-2 px-3 py-1 border-b last:border-b-0">
            <span className="text-sm text-muted-foreground col-span-7">{r.type}</span>
            <input value={r.seqNo} onChange={e => updateReceipt(r.id, { seqNo: e.target.value })}
              className="input-cell col-span-2" placeholder="Seq#" />
            <div className="col-span-3 flex justify-end">
              <CurrencyInput value={r.amount} onChange={v => updateReceipt(r.id, { amount: v })} />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-1.5 bg-secondary font-semibold text-sm">
          <span>Total Receipts</span>
          <CurrencyDisplay value={shopTotalReceipts} highlight />
        </div>
      </div>

      {/* ─── SECTION 4: TOTAL TAKINGS (Both shifts) ─── */}
      <div className="border-2 border-orange-500 rounded-lg overflow-hidden">
        <div className="bg-orange-600 text-white px-3 py-2 font-semibold text-sm">4. Total Takings (Section 1 − 2 + 3)</div>
        <ColHeader left="Shop Till" right="OPT" />
        <div className="grid grid-cols-2 divide-x">
          <div className="flex items-center justify-between px-3 py-2 font-bold text-sm">
            <span>Shop Takings</span>
            <CurrencyDisplay value={shopTotalTakings} highlight className="text-base" />
          </div>
          <div className="flex items-center justify-between px-3 py-2 font-bold text-sm">
            <span>OPT Takings</span>
            <CurrencyDisplay value={optTotalTakings} highlight className="text-base" />
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-2 bg-orange-50 border-t font-bold text-sm">
          <span>COMBINED TOTAL TAKINGS</span>
          <CurrencyDisplay value={combinedTotalTakings} highlight className="text-base text-orange-700" />
        </div>
      </div>

      {/* ─── SECTION 5: MOP CASH (Shop only) ─── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-blue-600 text-white px-3 py-2 font-semibold text-sm">5. MOP Cash — Shop Till Only</div>
        <div className="flex items-center justify-between px-3 py-1.5 border-b text-sm">
          <span className="text-muted-foreground">Cash Deposited for Banking</span>
          <CurrencyInput value={form.shop.cashDepositedBanking} onChange={v => setShop({ cashDepositedBanking: v })} />
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-b text-sm">
          <span className="text-muted-foreground">EasyPay</span>
          <CurrencyInput value={form.shop.easyPay} onChange={v => setShop({ easyPay: v })} />
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-b text-sm">
          <span className="text-muted-foreground">Coins</span>
          <CurrencyInput value={form.shop.coins} onChange={v => setShop({ coins: v })} />
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 bg-secondary font-semibold text-sm">
          <span>Cash Connect Total (Sum)</span>
          <CurrencyDisplay value={cashConnectTotal} highlight />
        </div>
      </div>

      {/* ─── SECTION 6: MOP SPEEDPOINTS (Both shifts, side by side) ─── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-purple-700 text-white px-3 py-2 font-semibold text-sm">6. MOP Speedpoints</div>
        <div className="grid grid-cols-2 border-b divide-x">
          <div className="px-3 py-1 grid grid-cols-8 gap-1 text-xs font-semibold text-muted-foreground bg-muted/30">
            <span className="col-span-4">Terminal (Shop)</span><span className="col-span-2">Batch#</span><span className="col-span-2 text-right">Amount</span>
          </div>
          <div className="px-3 py-1 grid grid-cols-8 gap-1 text-xs font-semibold text-muted-foreground bg-muted/30">
            <span className="col-span-4">Terminal (OPT)</span><span className="col-span-2">Batch#</span><span className="col-span-2 text-right">Amount</span>
          </div>
        </div>
        {/* Render rows for both — zip them together */}
        {Array.from({ length: Math.max(form.shop.speedpoints.length, form.opt.speedpoints.length) }).map((_, i) => {
          const s = form.shop.speedpoints[i];
          const o = form.opt.speedpoints[i];
          return (
            <div key={i} className="grid grid-cols-2 divide-x border-b last:border-b-0">
              {s ? (
                <div className="px-3 py-1 grid grid-cols-8 gap-1 items-center">
                  <span className="text-sm col-span-4">{s.terminal}</span>
                  <input value={s.batchNo} onChange={e => updateShopSpeedpoint(i, { batchNo: e.target.value })}
                    className="input-cell col-span-2 text-xs py-0.5" placeholder="Batch#" />
                  <div className="col-span-2">
                    <CurrencyInput value={s.shopAmount} onChange={v => updateShopSpeedpoint(i, { shopAmount: v })} className="w-full" />
                  </div>
                </div>
              ) : <div />}
              {o ? (
                <div className="px-3 py-1 grid grid-cols-8 gap-1 items-center">
                  <span className="text-sm col-span-4">{o.terminal}</span>
                  <input value={o.batchNo} onChange={e => updateOptSpeedpoint(i, { batchNo: e.target.value })}
                    className="input-cell col-span-2 text-xs py-0.5" placeholder="Batch#" />
                  <div className="col-span-2">
                    <CurrencyInput value={o.optAmount} onChange={v => updateOptSpeedpoint(i, { optAmount: v })} className="w-full" />
                  </div>
                </div>
              ) : <div />}
            </div>
          );
        })}
        <div className="grid grid-cols-2 divide-x bg-secondary font-semibold text-sm">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span>Shop Speedpoints Total</span>
            <CurrencyDisplay value={shopSpeedpointTotal} highlight />
          </div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span>OPT Speedpoints Total</span>
            <CurrencyDisplay value={optSpeedpointTotal} highlight />
          </div>
        </div>
      </div>

      {/* ─── SECTION 7: MOP ACCOUNT (Shop only) ─── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-blue-600 text-white px-3 py-2 font-semibold text-sm">7. MOP Account (Debtors) — Shop Till Only</div>
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted/30 border-b grid grid-cols-12 gap-2">
          <span className="col-span-8">Account</span><span className="col-span-3 text-right">Amount</span><span />
        </div>
        {form.shop.accounts.map(a => (
          <div key={a.id} className="flex items-center gap-1 px-2 py-1 border-b">
            <select value={a.name} onChange={e => updateAccount(a.id, { name: e.target.value }, 'shop')}
              className="input-cell flex-1 text-left text-xs">
              <option value="">Select account...</option>
              {ACCOUNTS.map(ac => <option key={ac}>{ac}</option>)}
            </select>
            <CurrencyInput value={a.amount} onChange={v => updateAccount(a.id, { amount: v }, 'shop')} className="w-28" />
            <button onClick={() => removeAccount(a.id, 'shop')} className="text-destructive p-0.5">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => addAccount('shop')} className="text-xs h-7">
            <Plus className="h-3 w-3 mr-1" />Add Account
          </Button>
          <span className="text-sm font-semibold pr-1 text-muted-foreground">Total: <CurrencyDisplay value={shopAccountTotal} /></span>
        </div>
      </div>

      {/* ─── SECTION 8: OTHER ADJUSTMENTS (Shop only) ─── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-primary text-primary-foreground px-3 py-2 font-semibold text-sm">8. Other Adjustments — Shop Till Only</div>
        {form.shop.otherAdjustments.map(o => (
          <div key={o.id} className="flex items-center gap-2 px-3 py-1 border-b">
            <input value={o.explanation} onChange={e => updateOther(o.id, { explanation: e.target.value })}
              className="input-cell flex-1 text-left" placeholder="Explanation" />
            <CurrencyInput value={o.amount} onChange={v => updateOther(o.id, { amount: v })} allowNegative />
            <button onClick={() => removeOther(o.id)} className="text-destructive p-1">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-1.5 border-b text-sm">
          <span className="text-muted-foreground">Returns (refund next day)</span>
          <CurrencyInput value={form.shop.returns_mop} onChange={v => setShop({ returns_mop: v })} allowNegative />
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-b text-sm">
          <span className="text-muted-foreground">Attendant Short/(Over)</span>
          <CurrencyInput value={form.shop.attendantShortOver} onChange={v => setShop({ attendantShortOver: v })} allowNegative />
        </div>
        <div className="px-3 py-1.5">
          <Button variant="outline" size="sm" onClick={addOther} className="text-xs h-7">
            <Plus className="h-3 w-3 mr-1" />Add Adjustment
          </Button>
        </div>
      </div>

      {/* ─── CASHIER BALANCE (Short/Over) ─── */}
      <div className="border-2 rounded-lg overflow-hidden">
        <div className="bg-muted px-3 py-2 font-semibold text-sm border-b">Cashier Balance — Short / (Over)</div>
        <div className="grid grid-cols-2 divide-x">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Shop Till</span>
            <ShortOverBadge diff={shopDifference} />
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold">OPT</span>
            <ShortOverBadge diff={optDifference} />
          </div>
        </div>
        <div className="px-4 py-3 flex items-center justify-between border-t bg-secondary">
          <span className="text-sm font-bold">COMBINED SHORT / (OVER)</span>
          <ShortOverBadge diff={shopDifference + optDifference} />
        </div>
        <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-t">
          Shop: Total Takings − MOP Cash − Speedpoints − Accounts − Other &nbsp;|&nbsp; OPT: Net Sales − Speedpoints
        </div>
      </div>

      {/* ─── EXPLANATIONS / NOTES ─── */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted px-3 py-2 font-semibold text-sm border-b">Explanations / Notes</div>
        <div className="p-3">
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            disabled={isLocked}
            rows={3}
            className="input-cell w-full resize-y text-sm"
            placeholder="Enter any notes or explanations..."
          />
        </div>
      </div>

      {/* ─── SAVE BUTTON ─── */}
      <div className="flex flex-col items-center gap-2 pt-2 pb-4">
        <Button onClick={handleSave} size="lg" className="px-12" disabled={isLocked}>
          <Save className="h-4 w-4 mr-2" /> Save Cashup
        </Button>
        {savedAt && (
          <p className="text-xs text-muted-foreground">
            Originally saved: <span className="font-semibold text-foreground">{savedAt}</span>
          </p>
        )}
      </div>
    </div>
  );
}
