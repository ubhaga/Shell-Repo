import { useState, useCallback } from "react";
import { useCashupStore } from "@/store/cashupStore";
import { CurrencyDisplay } from "@/components/ui/CashupUI";
import { CheckCircle, XCircle, MinusCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import type { DailyCashup, ManagerDailyEntry } from "@/types/cashup";

interface Props {
  selectedDate: string;
}

interface DayMetrics {
  date: string;
  cashierName?: string;
  enteredBy?: string;
  shopDiff: number | null;
  optDiff: number | null;
  payoutsDiff: number | null;
  invDiff: number | null;
  invMatch: boolean | null;
  vatDiff: number | null;
  vatMatch: boolean | null;
  hasData: boolean;
}

function computeDayMetrics(
  dateStr: string,
  cashup: DailyCashup | undefined,
  managerEntry: ManagerDailyEntry | undefined,
): DayMetrics {
  if (!cashup && !managerEntry) {
    return {
      date: dateStr,
      shopDiff: null,
      optDiff: null,
      payoutsDiff: null,
      invDiff: null,
      invMatch: null,
      vatDiff: null,
      vatMatch: null,
      hasData: false,
      enteredBy: undefined,
    };
  }

  let shopDiff: number | null = null;
  let optDiff: number | null = null;

  if (cashup) {
    const shopNetSales = cashup.shop.income - cashup.shop.returns - (cashup.shop.returns_today ?? 0);
    const shopPayoutsTotal = cashup.shop.payouts.reduce((s, p) => s + p.amount, 0);
    const shopReceipts = cashup.shop.receipts.reduce((s, r) => s + r.amount, 0);
    const shopTakings = shopNetSales - shopPayoutsTotal - cashup.shop.lottoPayouts + shopReceipts;
    const cashConnectTotal = cashup.shop.cashDepositedBanking + cashup.shop.easyPay + cashup.shop.coins;
    const shopSP = cashup.shop.speedpoints.reduce((s, sp) => s + sp.shopAmount, 0);
    const shopAcc = cashup.shop.accounts.reduce((s, a) => s + a.amount, 0);
    const shopOther = cashup.shop.otherAdjustments.reduce((s, o) => s + o.amount, 0);
    shopDiff =
      shopTakings -
      cashConnectTotal -
      shopSP -
      shopAcc -
      shopOther -
      cashup.shop.returns_mop -
      (cashup.shop.returnsNotCaptured ?? 0) -
      cashup.shop.attendantShortOver;

    const optNetSales = cashup.opt.income - cashup.opt.returns;
    const optSP = cashup.opt.speedpoints.reduce((s, sp) => s + sp.optAmount, 0);
    const optAcc = cashup.opt.accounts.reduce((s, a) => s + a.amount, 0);
    optDiff = optNetSales - optSP - optAcc;
  }

  // Payouts comparison: cashier payouts total vs manager 1.1 payout invoices total
  let payoutsDiff: number | null = null;
  if (cashup && managerEntry) {
    const cashierPayoutsTotal = cashup.shop.payouts.reduce((s, p) => s + p.amount, 0);
    const managerPayoutInvoicesTotal = managerEntry.payoutInvoices.reduce((s, i) => s + i.inclusive, 0);
    payoutsDiff = cashierPayoutsTotal - managerPayoutInvoicesTotal;
  }

  let invDiff: number | null = null;
  let invMatch: boolean | null = null;
  let vatDiff: number | null = null;
  let vatMatch: boolean | null = null;

  if (managerEntry) {
    const invTotal =
      managerEntry.payoutInvoices.reduce((s, i) => s + i.inclusive, 0) +
      managerEntry.eftInvoices.reduce((s, i) => s + i.inclusive, 0);
    const invVat =
      managerEntry.payoutInvoices.reduce((s, i) => s + i.vat, 0) +
      managerEntry.eftInvoices.reduce((s, i) => s + i.vat, 0);
    invDiff = invTotal - managerEntry.branchDayEndTotal;
    invMatch = Math.abs(invDiff) < 0.5;
    vatDiff = invVat - managerEntry.branchDayEndVat;
    vatMatch = Math.abs(vatDiff) < 1.0;
  }

  // Combine entered_by from cashup and manager (they may differ)
  const enteredBy = cashup?.enteredBy || managerEntry?.enteredBy || undefined;

  return {
    date: dateStr,
    cashierName: cashup?.cashierName,
    enteredBy,
    shopDiff,
    optDiff,
    payoutsDiff,
    invDiff,
    invMatch,
    vatDiff,
    vatMatch,
    hasData: true,
  };
}

function StatusIcon({ status }: { status: "green" | "red" | "none" }) {
  if (status === "green") return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === "red") return <XCircle className="h-4 w-4 text-red-600" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground/30" />;
}

export function MonthlyDashboard({ selectedDate }: Props) {
  const { getCashupByDate, getManagerEntryByDate, updateManagerEntry, addManagerEntry } = useCashupStore();
  const [editingExplanations, setEditingExplanations] = useState<Record<string, string>>({});

  const selected = parseISO(selectedDate);
  const monthStart = startOfMonth(selected);
  const monthEnd = endOfMonth(selected);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const rows: DayMetrics[] = days.map((day) => {
    const ds = format(day, "yyyy-MM-dd");
    return computeDayMetrics(ds, getCashupByDate(ds), getManagerEntryByDate(ds));
  });

  const handleExplanationChange = useCallback((date: string, value: string) => {
    setEditingExplanations(prev => ({ ...prev, [date]: value }));
  }, []);

  const handleExplanationBlur = useCallback(async (date: string) => {
    const value = editingExplanations[date];
    if (value === undefined) return;
    const existing = getManagerEntryByDate(date);
    if (existing) {
      await updateManagerEntry(existing.id, { explanations: value });
    } else {
      await addManagerEntry({
        date,
        cashupId: '',
        enteredBy: '',
        explanations: value,
        payoutInvoices: [],
        eftInvoices: [],
        coinsOpeningBalance: 0,
        easypayOpeningBalance: 0,
        cashConnectOpeningBalance: 0,
        dailyCoins: 0,
        cashDepositedEasypay: 0,
        cashDepositedCashConnect: 0,
        ccBagClosureCoins: 0,
        ccBagClosureEasypay: 0,
        ccBagClosureCashConnect: 0,
        transferFromCoins: 0,
        branchDayEndTotal: 0,
        branchDayEndVat: 0,
        invoiceNotes: '',
        cashReconcNotes: '',
        bankChargesRate: 0,
        bankCharges: 0,
        banking: 0,
        locked: false,
      });
    }
    setEditingExplanations(prev => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }, [editingExplanations, getManagerEntryByDate, updateManagerEntry, addManagerEntry]);

  const dataRows = rows.filter((r) => r.hasData);
  const totalShopDiff = dataRows.reduce((s, r) => s + (r.shopDiff ?? 0), 0);
  const greenCount = dataRows.filter((r) => {
    const shopOk = r.shopDiff !== null && Math.abs(r.shopDiff) < 20;
    const optOk = r.optDiff === null || Math.abs(r.optDiff) < 0.01;
    const payoutsOk = r.payoutsDiff === null || Math.abs(r.payoutsDiff) < 0.5;
    const invOk = r.invMatch === null || r.invMatch;
    const vatOk = r.vatMatch === null || r.vatMatch;
    return shopOk && optOk && payoutsOk && invOk && vatOk;
  }).length;

  return (
    <div className="space-y-4">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{format(monthStart, "MMMM yyyy")} — Monthly Overview</h2>
          <p className="text-sm text-muted-foreground">
            {dataRows.length} day{dataRows.length !== 1 ? "s" : ""} captured · {greenCount} balanced
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Month Shop Short/(Over)</div>
          <CurrencyDisplay value={totalShopDiff} highlight className="text-lg" />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-center px-1 py-2 font-semibold text-muted-foreground w-8 border-r text-xs">St</th>
                <th className="text-center px-1 py-2 font-semibold text-muted-foreground border-r text-xs whitespace-nowrap">Date</th>
                <th className="text-center px-1 py-2 font-semibold text-muted-foreground border-r text-xs whitespace-nowrap">By</th>
                <th className="text-center px-1 py-2 font-semibold text-muted-foreground border-r text-xs whitespace-nowrap">Shop</th>
                <th className="text-center px-1 py-2 font-semibold text-muted-foreground border-r text-xs whitespace-nowrap">Pay</th>
                <th className="text-center px-1 py-2 font-semibold text-muted-foreground border-r text-xs whitespace-nowrap">OPT</th>
                <th className="text-center px-1 py-2 font-semibold text-muted-foreground border-r text-xs whitespace-nowrap">Inv</th>
                <th className="text-center px-1 py-2 font-semibold text-muted-foreground border-r text-xs whitespace-nowrap">VAT</th>
                <th className="text-center px-1 py-2 font-semibold text-muted-foreground" style={{ width: '40%' }}>Explanation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const d = parseISO(row.date);
                if (!row.hasData) {
                  return (
                    <tr key={row.date} className="border-b last:border-b-0 bg-muted/10">
                      <td className="px-1 py-1 border-r"><StatusIcon status="none" /></td>
                      <td className="px-1 py-1 text-center text-muted-foreground/40 border-r text-xs">{format(d, "EEE dd")}</td>
                      <td colSpan={7} className="px-1 py-1 text-muted-foreground/30 text-center italic text-xs">
                        No data
                      </td>
                    </tr>
                  );
                }

                const shopOk = row.shopDiff !== null && Math.abs(row.shopDiff) < 20;
                const optOk = row.optDiff === null || Math.abs(row.optDiff) < 0.01;
                const showOpt = row.optDiff !== null && Math.abs(row.optDiff) >= 0.01;
                const payoutsOk = row.payoutsDiff === null || Math.abs(row.payoutsDiff) < 0.5;
                const invOk = row.invMatch === null || row.invMatch;
                const vatOk = row.vatMatch === null || row.vatMatch;
                const allOk = shopOk && optOk && payoutsOk && invOk && vatOk;

                return (
                  <tr key={row.date} className={`border-b last:border-b-0 ${allOk ? "" : "bg-red-50/50"}`}>
                    <td className="px-1 py-1 border-r">
                      <div className="flex justify-center">
                        {allOk ? (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                        ) : (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1 text-center font-medium border-r text-xs whitespace-nowrap">{format(d, "EEE dd")}</td>
                    <td className="px-1 py-1 text-center text-muted-foreground border-r text-xs">{row.enteredBy || "—"}</td>
                    <td className="px-1 py-1 text-center border-r">
                      {row.shopDiff !== null ? (
                        <span className={`inline-flex items-center justify-center font-mono text-xs ${shopOk ? "text-green-700" : "text-red-600 font-semibold"}`}>
                          <CurrencyDisplay value={row.shopDiff} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-1 py-1 text-center border-r">
                      {row.payoutsDiff !== null ? (
                        <span className={`inline-flex items-center justify-center font-mono text-xs ${payoutsOk ? "text-green-700" : "text-red-600 font-semibold"}`}>
                          {payoutsOk ? "✓" : <CurrencyDisplay value={row.payoutsDiff} />}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-1 py-1 text-center border-r">
                      {showOpt ? (
                        <span className="inline-flex items-center justify-center font-mono text-xs text-red-600 font-semibold">
                          <CurrencyDisplay value={row.optDiff!} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-1 py-1 border-r">
                      <div className="flex justify-center">
                        {row.invMatch !== null ? (
                          <StatusIcon status={invOk ? "green" : "red"} />
                        ) : (
                          <StatusIcon status="none" />
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1 border-r">
                      <div className="flex justify-center">
                        {row.vatMatch !== null ? (
                          <StatusIcon status={vatOk ? "green" : "red"} />
                        ) : (
                          <StatusIcon status="none" />
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <textarea
                        className="w-full min-h-[28px] text-xs rounded-md border border-input bg-background px-2 py-1 resize-none overflow-hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        rows={1}
                        placeholder={allOk ? "" : "Explain variance..."}
                        value={editingExplanations[row.date] ?? (getManagerEntryByDate(row.date)?.explanations || "")}
                        onChange={(e) => {
                          handleExplanationChange(row.date, e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onBlur={() => handleExplanationBlur(row.date)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {dataRows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50 border-t-2 font-semibold text-xs">
                  <td colSpan={3} className="px-1 py-2 text-center border-r">
                    Total
                  </td>
                  <td className="px-1 py-2 text-center border-r">
                    <CurrencyDisplay value={totalShopDiff} highlight />
                  </td>
                  <td className="px-1 py-2 text-center border-r">
                    <CurrencyDisplay value={dataRows.reduce((s, r) => s + (r.payoutsDiff ?? 0), 0)} highlight />
                  </td>
                  <td className="px-1 py-2 text-center border-r">
                    <CurrencyDisplay
                      value={dataRows.reduce(
                        (s, r) => s + (r.optDiff !== null && Math.abs(r.optDiff) >= 0.01 ? r.optDiff : 0),
                        0,
                      )}
                    />
                  </td>
                  <td className="px-1 py-2 text-center text-xs text-muted-foreground border-r">
                    {dataRows.filter((r) => r.invMatch === true).length}/
                    {dataRows.filter((r) => r.invMatch !== null).length}
                  </td>
                  <td className="px-1 py-2 text-center text-xs text-muted-foreground border-r">
                    {dataRows.filter((r) => r.vatMatch === true).length}/
                    {dataRows.filter((r) => r.vatMatch !== null).length}
                  </td>
                  <td className="px-1 py-2 text-center text-xs">
                    {greenCount}/{dataRows.length}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
