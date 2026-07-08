import { useState, useEffect } from "react";
import { useCashupStore } from "@/store/cashupStore";
import { useMasterDataStore } from "@/store/masterDataStore";
import type { MonthlyBranchFigures } from "@/types/cashup";
import { Section, DataRow, CurrencyInput, CurrencyDisplay } from "@/components/ui/CashupUI";
import { Button } from "@/components/ui/button";
import { Save, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { DebtorsBranchComparison } from "./DebtorsBranchComparison";
import { supabase } from "@/integrations/supabase/client";

const SP_TERMINALS = ["Term 247608", "Forecourt 929661", "Retail 200660", "Scan to pay"];

interface Props {
  selectedDate: string;
}

const MetricRow = ({
  label,
  spreadsheet,
  branch,
  match,
  onChange,
  explanation,
  onExplanationChange,
}: {
  label: string;
  spreadsheet: number;
  branch: number;
  match: boolean;
  onChange: (v: number) => void;
  explanation: string;
  onExplanationChange: (v: string) => void;
}) => {
  const diff = spreadsheet - branch;
  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr] gap-3 px-3 py-2 border-b last:border-b-0 text-sm items-center">
      <span className="text-muted-foreground">{label}</span>
      <CurrencyDisplay value={spreadsheet} className="text-right" />
      <div className="flex justify-center">
        <CurrencyInput value={branch} onChange={onChange} className="text-right w-full max-w-[120px]" />
      </div>
      <div
        className={`flex items-center justify-center gap-1 rounded px-2 py-0.5 font-semibold text-xs ${match ? "status-green" : "status-red"}`}
      >
        {match ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
        {match ? "MATCH" : <CurrencyDisplay value={diff} />}
      </div>
      <input
        value={explanation}
        onChange={(e) => onExplanationChange(e.target.value)}
        className="input-cell w-full text-left text-xs"
        placeholder={match ? "" : "Explain variance..."}
      />
    </div>
  );
};

export function ManagerMonthlyForm({ selectedDate }: Props) {
  const month = selectedDate.slice(0, 7);
  const { getMonthlyFiguresByMonth, addMonthlyFigures, updateMonthlyFigures, cashups, managerEntries } =
    useCashupStore();
  const { managerNames: MANAGER_NAMES } = useMasterDataStore();
  const existing = getMonthlyFiguresByMonth(month);

  const [form, setForm] = useState<Omit<MonthlyBranchFigures, "id">>({
    month,
    enteredBy: "",
    branchNetSales: 0,
    branchTotalPayouts: 0,
    branchTotalReceipts: 0,
    branchTotalInvoicesCapital: 0,
    branchTotalInvoicesVat: 0,
    salesCStore: 0,
    salesWslDsl: 0,
    salesFuel: 0,
    salesGas: 0,
    salesOil: 0,
    adjCStore: 0,
    adjWslDsl: 0,
    adjFuel: 0,
    adjGas: 0,
    adjOil: 0,
    adjVat: 0,
    vatTaxAmount: 0,
    explanationNetSales: "",
    explanationPayouts: "",
    explanationReceipts: "",
    explanationInvoices: "",
    explanationVat: "",
    explanationBankCharges: "",
    cashConnectInvoiceInclVat: 0,
    bankChargesAdj: 0,
    ccXero: 0,
    ccUnbankedDeposit: 0,
    pettyCashRecon: 0,
    pettyCashXero: 0,
    pettyCashUnbankedDeposit: 0,
    eftXero: 0,
    eftUnbankedDeposit: 0,
    notes: "",
    airtimeBldBalance: 0,
    airtimeEasypayBalance: 0,
    airtimeLottoBalance: 0,
  });

  const [bankChargesExpanded, setBankChargesExpanded] = useState(false);
  const [eftBankTotal, setEftBankTotal] = useState(0);

  useEffect(() => {
    if (existing) setForm({ ...existing });
    else setForm((f) => ({ ...f, month }));
  }, [month, existing?.id]);

  useEffect(() => {
    (async () => {
      const [y, m] = month.split("-").map(Number);
      const endStr = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      const { data } = await supabase
        .from("bank_statement_lines")
        .select("amount, matched_terminal, transaction_date")
        .lte("transaction_date", endStr);
      const total = (data ?? [])
        .filter((l) => l.matched_terminal && SP_TERMINALS.includes(l.matched_terminal))
        .reduce((s, l) => s + Number(l.amount ?? 0), 0);
      setEftBankTotal(total);
    })();
  }, [month]);

  // Compute from store
  const monthCashups = cashups.filter((c) => c.month === month);
  const monthManagers = managerEntries.filter((e) => e.date.startsWith(month));

  const spreadsheetNetSales = monthCashups.reduce((s, c) => {
    const shopNet = c.shop.income - c.shop.returns - (c.shop.returns_today ?? 0);
    const optNet = c.opt.income - c.opt.returns - ((c.opt as any).returns_today ?? 0);
    return s + shopNet + optNet;
  }, 0);

  const spreadsheetPayouts = monthCashups.reduce((s, c) => {
    return s + c.shop.payouts.reduce((ps, p) => ps + p.amount, 0) + c.shop.lottoPayouts;
  }, 0);

  const spreadsheetReceipts = monthCashups.reduce((s, c) => s + c.shop.receipts.reduce((rs, r) => rs + r.amount, 0), 0);

  const spreadsheetInvoicesTotal = monthManagers.reduce(
    (s, e) =>
      s +
      e.payoutInvoices.reduce((is, i) => is + i.inclusive, 0) +
      e.eftInvoices.reduce((is, i) => is + i.inclusive, 0),
    0,
  );

  const spreadsheetInvoicesVat = monthManagers.reduce(
    (s, e) => s + e.payoutInvoices.reduce((is, i) => is + i.vat, 0) + e.eftInvoices.reduce((is, i) => is + i.vat, 0),
    0,
  );

  const salesMatch = Math.abs(spreadsheetNetSales - form.branchNetSales) < 1;
  const payoutsMatch = Math.abs(spreadsheetPayouts - form.branchTotalPayouts) < 1;
  const receiptsMatch = Math.abs(spreadsheetReceipts - form.branchTotalReceipts) < 1;
  const invoicesMatch = Math.abs(spreadsheetInvoicesTotal - form.branchTotalInvoicesCapital) < 1;
  const vatMatch = Math.abs(spreadsheetInvoicesVat - form.branchTotalInvoicesVat) < 1;

  // Bank charges range: last day of previous month through second-to-last day of current month
  const [yearStr, monthStr] = month.split("-");
  const yearN = parseInt(yearStr, 10);
  const monthN = parseInt(monthStr, 10);
  const lastDayPrev = new Date(yearN, monthN - 1, 0); // last day of prev month
  const lastDayCurr = new Date(yearN, monthN, 0); // last day of current month
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const rangeStart = fmtDate(lastDayPrev);
  const rangeEndExclusive = fmtDate(lastDayCurr); // exclude this day
  const bankChargesEntries = managerEntries
    .filter((e) => e.date >= rangeStart && e.date < rangeEndExclusive)
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalBankCharges = bankChargesEntries.reduce((s, e) => s + (e.bankCharges ?? 0), 0);
  const bankChargesDiff = form.cashConnectInvoiceInclVat - totalBankCharges;

  // 6.2 CC Recon closing on last day of the month
  const monthManagersSorted = [...monthManagers].sort((a, b) => a.date.localeCompare(b.date));
  const lastMgr = monthManagersSorted[monthManagersSorted.length - 1];
  const ccReconClosing = (() => {
    if (!lastMgr) return 0;
    const cu = cashups.find((c) => c.date === lastMgr.date);
    const dailyCC = cu?.shop.cashDepositedBanking ?? 0;
    return (
      (lastMgr.cashConnectOpeningBalance ?? 0) +
      dailyCC -
      Math.abs(lastMgr.ccBagClosureCashConnect ?? 0) +
      Math.abs(lastMgr.transferFromCoins ?? 0)
    );
  })();
  const ccTotalCol1 = ccReconClosing + form.ccUnbankedDeposit;

  // 6.3 Petty Cash / Coins closing balance — walk from seed date to end of month
  const coinsReconClosing = (() => {
    const SEED_DATE = "2026-01-01";
    const SEED_COINS = 4483.15;
    const endStr = fmtDate(lastDayCurr);
    let coins = SEED_COINS;
    const start = new Date(SEED_DATE + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");
    const d = new Date(start);
    while (d <= end) {
      const ds = fmtDate(d);
      const cu = cashups.find((c) => c.date === ds);
      const en = managerEntries.find((e) => e.date === ds);
      const dailyCoins = cu?.shop.coins ?? 0;
      const closureCoins = Math.abs(en?.ccBagClosureCoins ?? 0);
      const transferFromCoins = Math.abs(en?.transferFromCoins ?? 0);
      coins = coins + dailyCoins - closureCoins - transferFromCoins;
      d.setDate(d.getDate() + 1);
    }
    return coins;
  })();
  const pettyCashTotalCol1 = coinsReconClosing + form.pettyCashUnbankedDeposit;

  // 3. EFT Recon — total unbanked speedpoints for the month
  const speedpointCashupTotal = monthCashups.reduce((s, c) => {
    const shop = c.shop.speedpoints.filter((sp) => SP_TERMINALS.includes(sp.terminal)).reduce((a, sp) => a + sp.shopAmount, 0);
    const opt = c.opt.speedpoints.filter((sp) => SP_TERMINALS.includes(sp.terminal)).reduce((a, sp) => a + sp.optAmount, 0);
    return s + shop + opt;
  }, 0);
  const eftReconClosing = speedpointCashupTotal - eftBankTotal;
  const eftTotalCol1 = eftReconClosing + form.eftUnbankedDeposit;

  const handleSave = async () => {
    try {
      if (existing) await updateMonthlyFigures(existing.id, form);
      else await addMonthlyFigures(form);
      toast({ title: "Monthly figures saved", description: `Saved for ${format(new Date(month + "-01"), "MMM yyyy")}` });
    } catch (error) {
      toast({
        title: "Monthly figures not saved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-card border rounded-lg p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Month</label>
          <div className="input-cell w-full mt-0.5 text-center font-semibold">
            {format(new Date(month + "-01"), "MMMM yyyy")}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Entered By</label>
          <select
            value={form.enteredBy}
            onChange={(e) => setForm((f) => ({ ...f, enteredBy: e.target.value }))}
            className="input-cell w-full mt-0.5"
          >
            <option value="">Select...</option>
            {MANAGER_NAMES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="col-span-1">
          <label className="text-xs text-muted-foreground">Notes</label>
          <input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="input-cell w-full mt-0.5 text-left"
            placeholder="Any month end notes..."
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
        Showing data for: <strong>{format(new Date(month + "-01"), "MMMM yyyy")}</strong> — {monthCashups.length} cashup
        days recorded this month
      </div>

      {/* Month End Report */}
      <Section title="1.1 Branch Month End Report" color="blue">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
          <span>Metric</span>
          <span className="text-right">Spreadsheet Total</span>
          <span className="text-center">Branch Report (enter below)</span>
          <span className="text-center">Status</span>
          <span>Explanation</span>
        </div>
        <MetricRow
          label="Net Sales"
          spreadsheet={spreadsheetNetSales}
          branch={form.branchNetSales}
          match={salesMatch}
          onChange={(v) => setForm((f) => ({ ...f, branchNetSales: v }))}
          explanation={form.explanationNetSales}
          onExplanationChange={(v) => setForm((f) => ({ ...f, explanationNetSales: v }))}
        />
        <MetricRow
          label="Total Payouts"
          spreadsheet={spreadsheetPayouts}
          branch={form.branchTotalPayouts}
          match={payoutsMatch}
          onChange={(v) => setForm((f) => ({ ...f, branchTotalPayouts: v }))}
          explanation={form.explanationPayouts}
          onExplanationChange={(v) => setForm((f) => ({ ...f, explanationPayouts: v }))}
        />
        <MetricRow
          label="Total Receipts"
          spreadsheet={spreadsheetReceipts}
          branch={form.branchTotalReceipts}
          match={receiptsMatch}
          onChange={(v) => setForm((f) => ({ ...f, branchTotalReceipts: v }))}
          explanation={form.explanationReceipts}
          onExplanationChange={(v) => setForm((f) => ({ ...f, explanationReceipts: v }))}
        />
      </Section>

      {/* Creditors Transactions Report */}
      <Section title="1.2 Branch Creditors Transactions Report" color="purple">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
          <span>Metric</span>
          <span className="text-right">Spreadsheet Total</span>
          <span className="text-center">Branch Report (enter below)</span>
          <span className="text-center">Status</span>
          <span>Explanation</span>
        </div>
        <MetricRow
          label="Total Invoices (Incl.)"
          spreadsheet={spreadsheetInvoicesTotal}
          branch={form.branchTotalInvoicesCapital}
          match={invoicesMatch}
          onChange={(v) => setForm((f) => ({ ...f, branchTotalInvoicesCapital: v }))}
          explanation={form.explanationInvoices}
          onExplanationChange={(v) => setForm((f) => ({ ...f, explanationInvoices: v }))}
        />
        <MetricRow
          label="Total VAT"
          spreadsheet={spreadsheetInvoicesVat}
          branch={form.branchTotalInvoicesVat}
          match={vatMatch}
          onChange={(v) => setForm((f) => ({ ...f, branchTotalInvoicesVat: v }))}
          explanation={form.explanationVat}
          onExplanationChange={(v) => setForm((f) => ({ ...f, explanationVat: v }))}
        />
      </Section>

      {/* Month End Report (Other) */}
      <Section title="1.3 Branch Month End Report (Other)" color="orange">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
          <span>Description</span>
          <span className="text-center">Sales Value</span>
          <span className="text-center">Adjustments</span>
          <span className="text-center">Sales Value (adj)</span>
        </div>
        {[
          { label: "Sales C Store", key: "salesCStore" as const, adjKey: "adjCStore" as const },
          { label: "Sales WSL DSL", key: "salesWslDsl" as const, adjKey: "adjWslDsl" as const },
          { label: "Sales Fuel", key: "salesFuel" as const, adjKey: "adjFuel" as const },
          { label: "Sales Gas", key: "salesGas" as const, adjKey: "adjGas" as const },
          { label: "Sales Oil", key: "salesOil" as const, adjKey: "adjOil" as const },
        ].map(({ label, key, adjKey }) => (
          <div key={key} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
            <span className="text-muted-foreground">{label}</span>
            <div className="flex justify-center">
              <CurrencyInput
                value={form[key]}
                onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                className="text-right w-full max-w-[120px]"
              />
            </div>
            <div className="flex justify-center">
              <CurrencyInput
                value={form[adjKey]}
                onChange={(v) => setForm((f) => ({ ...f, [adjKey]: v }))}
                className="text-right w-full max-w-[120px]"
              />
            </div>
            <div className="flex justify-center">
              <CurrencyDisplay value={form[key] + form[adjKey]} className="text-right w-full max-w-[120px]" />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
          <span>Tax</span>
          <span className="text-center">Tax Amount</span>
          <span className="text-center">Adjustments</span>
          <span className="text-center">Tax Amount (adj)</span>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
          <span className="text-muted-foreground">VAT</span>
          <div className="flex justify-center">
            <CurrencyInput
              value={form.vatTaxAmount}
              onChange={(v) => setForm((f) => ({ ...f, vatTaxAmount: v }))}
              className="text-right w-full max-w-[120px]"
            />
          </div>
          <div className="flex justify-center">
            <CurrencyInput
              value={form.adjVat}
              onChange={(v) => setForm((f) => ({ ...f, adjVat: v }))}
              className="text-right w-full max-w-[120px]"
            />
          </div>
          <div className="flex justify-center">
            <CurrencyDisplay value={form.vatTaxAmount + form.adjVat} className="text-right w-full max-w-[120px]" />
          </div>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-3 py-2 text-sm items-center bg-secondary font-semibold">
          <span>Total Sales (incl. VAT)</span>
          <CurrencyDisplay
            value={
              form.salesCStore + form.salesWslDsl + form.salesFuel + form.salesGas + form.salesOil + form.vatTaxAmount
            }
            className="text-right"
          />
          <CurrencyDisplay
            value={form.adjCStore + form.adjWslDsl + form.adjFuel + form.adjGas + form.adjOil + form.adjVat}
            className="text-right"
          />
          <CurrencyDisplay
            value={
              form.salesCStore +
              form.salesWslDsl +
              form.salesFuel +
              form.salesGas +
              form.salesOil +
              form.vatTaxAmount +
              form.adjCStore +
              form.adjWslDsl +
              form.adjFuel +
              form.adjGas +
              form.adjOil +
              form.adjVat
            }
            className="text-right"
          />
        </div>
      </Section>

      {/* Airtime / Lotto Balance */}
      <Section title="8. Airtime / Lotto Balance" color="green">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
          <span>Description</span>
          <span className="text-center">Blue Label</span>
          <span className="text-center">Easy Pay</span>
          <span className="text-center">Lotto (Unpaid days combined)</span>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
          <span className="text-muted-foreground font-medium">Month End Bal</span>
          <div className="flex justify-center">
            <CurrencyInput
              value={form.airtimeBldBalance}
              onChange={(v) => setForm((f) => ({ ...f, airtimeBldBalance: v }))}
              className="text-right w-full max-w-[120px]"
              allowNegative
            />
          </div>
          <div className="flex justify-center">
            <CurrencyInput
              value={form.airtimeEasypayBalance}
              onChange={(v) => setForm((f) => ({ ...f, airtimeEasypayBalance: v }))}
              className="text-right w-full max-w-[120px]"
              allowNegative
            />
          </div>
          <div className="flex justify-center">
            <CurrencyInput
              value={form.airtimeLottoBalance}
              onChange={(v) => setForm((f) => ({ ...f, airtimeLottoBalance: v }))}
              className="text-right w-full max-w-[120px]"
              allowNegative
            />
          </div>
        </div>
      </Section>

      {/* 3. EFT Recon */}
      <Section title="3. EFT Recon" color="purple">
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
          <span>Description</span>
          <span className="text-right">EFT Recon</span>
          <span className="text-right">Xero</span>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
          <span className="text-muted-foreground">EFT Recon Closing Balance</span>
          <CurrencyDisplay value={eftReconClosing} className="text-right" />
          <div className="flex justify-end">
            <CurrencyInput
              value={form.eftXero}
              onChange={(v) => setForm((f) => ({ ...f, eftXero: v }))}
              className="text-right w-full max-w-[140px]"
              allowNegative
            />
          </div>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
          <span className="text-muted-foreground">Un Banked Deposit</span>
          <div className="flex justify-end">
            <CurrencyInput
              value={form.eftUnbankedDeposit}
              onChange={(v) => setForm((f) => ({ ...f, eftUnbankedDeposit: v }))}
              className="text-right w-full max-w-[140px]"
              allowNegative
            />
          </div>
          <span></span>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-2 text-sm items-center bg-secondary font-semibold">
          <div className="flex items-center gap-2">
            <span>Total</span>
            {(() => {
              const match = Math.abs(eftTotalCol1 - form.eftXero) < 0.01;
              return (
                <span
                  className={`flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-xs ${match ? "status-green" : "status-red"}`}
                >
                  {match ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                  {match ? "MATCH" : <CurrencyDisplay value={eftTotalCol1 - form.eftXero} />}
                </span>
              );
            })()}
          </div>
          <CurrencyDisplay value={eftTotalCol1} className="text-right" highlight />
          <CurrencyDisplay value={form.eftXero} className="text-right" highlight />
        </div>
      </Section>

      {/* Bank Charges */}
      <Section title="6. CASH CONNECT" color="blue">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
          <span>Description</span>
          <span className="text-right">Bank Charges (Manager Daily 2.1)</span>
          <span className="text-right">Cash Connect Invoice (Incl. VAT)</span>
          <span className="text-right">Difference</span>
          <span className="text-right">Adjustment</span>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
          <button
            type="button"
            onClick={() => setBankChargesExpanded((v) => !v)}
            className="flex items-center gap-1 text-left text-muted-foreground hover:text-foreground"
          >
            {bankChargesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span>
              6.1 CC Bank Charges ({rangeStart} → {fmtDate(new Date(yearN, monthN, -1))})
            </span>
          </button>
          <CurrencyDisplay value={totalBankCharges} className="text-right" />
          <div className="flex justify-end">
            <CurrencyInput
              value={form.cashConnectInvoiceInclVat}
              onChange={(v) => setForm((f) => ({ ...f, cashConnectInvoiceInclVat: v }))}
              className="text-right w-full max-w-[140px]"
            />
          </div>
          <CurrencyDisplay
            value={bankChargesDiff}
            className={`text-right ${Math.abs(bankChargesDiff) < 0.01 ? "" : "text-destructive"}`}
          />
          <div className="flex justify-end">
            <CurrencyInput
              value={form.bankChargesAdj}
              onChange={(v) => setForm((f) => ({ ...f, bankChargesAdj: v }))}
              className="text-right w-full max-w-[140px]"
              allowNegative
            />
          </div>
        </div>
        {bankChargesExpanded && (
          <div className="bg-muted/20">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground">
              <span className="pl-6">Date</span>
              <span className="text-right">Bank Charges</span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            {bankChargesEntries.length === 0 ? (
              <div className="px-3 py-2 pl-9 text-xs text-muted-foreground">No entries in range</div>
            ) : (
              bankChargesEntries.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-3 py-1.5 border-b text-xs items-center"
                >
                  <span className="pl-6 text-muted-foreground">{e.date}</span>
                  <CurrencyDisplay value={e.bankCharges ?? 0} className="text-right" />
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              ))
            )}
          </div>
        )}
        <div className="px-3 py-2 border-t">
          <input
            value={form.explanationBankCharges}
            onChange={(e) => setForm((f) => ({ ...f, explanationBankCharges: e.target.value }))}
            className="input-cell w-full text-left text-xs"
            placeholder="Explanation / notes for bank charges adjustment..."
          />
        </div>

        {/* 6.2 Cash Connect Balance (Excl EP) */}
        <div className="border-t bg-muted/10">
          <div className="px-3 py-2 text-sm font-semibold">6.2 Cash Connect Balance (Excl EP)</div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
            <span>Description</span>
            <span className="text-right">CC Recon</span>
            <span className="text-right">Xero</span>
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
            <span className="text-muted-foreground">
              CC Closing Balance ({lastMgr ? lastMgr.date : "—"})
            </span>
            <CurrencyDisplay value={ccReconClosing} className="text-right" />
            <div className="flex justify-end">
              <CurrencyInput
                value={form.ccXero}
                onChange={(v) => setForm((f) => ({ ...f, ccXero: v }))}
                className="text-right w-full max-w-[140px]"
                allowNegative
              />
            </div>
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
            <span className="text-muted-foreground">Un Banked Deposit</span>
            <div className="flex justify-end">
              <CurrencyInput
                value={form.ccUnbankedDeposit}
                onChange={(v) => setForm((f) => ({ ...f, ccUnbankedDeposit: v }))}
                className="text-right w-full max-w-[140px]"
                allowNegative
              />
            </div>
            <span></span>
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-2 text-sm items-center bg-secondary font-semibold">
            <div className="flex items-center gap-2">
              <span>Total</span>
              {(() => {
                const match = Math.abs(ccTotalCol1 - form.ccXero) < 0.01;
                return (
                  <span
                    className={`flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-xs ${match ? "status-green" : "status-red"}`}
                  >
                    {match ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {match ? "MATCH" : <CurrencyDisplay value={ccTotalCol1 - form.ccXero} />}
                  </span>
                );
              })()}
            </div>
            <CurrencyDisplay value={ccTotalCol1} className="text-right" highlight />
            <CurrencyDisplay value={form.ccXero} className="text-right" highlight />
          </div>
        </div>

        {/* 6.3 Petty Cash */}
        <div className="border-t bg-muted/10">
          <div className="px-3 py-2 text-sm font-semibold">6.3 Petty Cash</div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-1.5 border-b text-xs font-semibold text-muted-foreground bg-muted/30">
            <span>Description</span>
            <span className="text-right">PC Recon</span>
            <span className="text-right">Xero</span>
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
            <span className="text-muted-foreground">
              PC Closing Balance ({lastMgr ? lastMgr.date : "—"})
            </span>
            <CurrencyDisplay value={coinsReconClosing} className="text-right" />
            <div className="flex justify-end">
              <CurrencyInput
                value={form.pettyCashXero}
                onChange={(v) => setForm((f) => ({ ...f, pettyCashXero: v }))}
                className="text-right w-full max-w-[140px]"
                allowNegative
              />
            </div>
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-2 border-b text-sm items-center">
            <span className="text-muted-foreground">Un Banked Deposit</span>
            <div className="flex justify-end">
              <CurrencyInput
                value={form.pettyCashUnbankedDeposit}
                onChange={(v) => setForm((f) => ({ ...f, pettyCashUnbankedDeposit: v }))}
                className="text-right w-full max-w-[140px]"
                allowNegative
              />
            </div>
            <span></span>
          </div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-3 py-2 text-sm items-center bg-secondary font-semibold">
            <div className="flex items-center gap-2">
              <span>Total</span>
              {(() => {
                const match = Math.abs(pettyCashTotalCol1 - form.pettyCashXero) < 0.01;
                return (
                  <span
                    className={`flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-xs ${match ? "status-green" : "status-red"}`}
                  >
                    {match ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {match ? "MATCH" : <CurrencyDisplay value={pettyCashTotalCol1 - form.pettyCashXero} />}
                  </span>
                );
              })()}
            </div>
            <CurrencyDisplay value={pettyCashTotalCol1} className="text-right" highlight />
            <CurrencyDisplay value={form.pettyCashXero} className="text-right" highlight />
          </div>
        </div>
      </Section>

      <Button onClick={handleSave} className="w-full" size="sm">

        <Save className="h-3.5 w-3.5 mr-1" />
        Save Monthly
      </Button>

      <DebtorsBranchComparison month={month} />

      {/* Month End Status */}
      <div
        className={`rounded-xl border-2 p-4 text-center ${salesMatch && payoutsMatch && receiptsMatch && invoicesMatch && vatMatch ? "border-green-500 bg-green-50" : "border-destructive bg-destructive/5"}`}
      >
        <div className="text-2xl mb-1">
          {salesMatch && payoutsMatch && receiptsMatch && invoicesMatch && vatMatch ? "✅" : "❌"}
        </div>
        <div className="font-bold text-lg">
          {salesMatch && payoutsMatch && receiptsMatch && invoicesMatch && vatMatch
            ? "Month End Reconciled"
            : "Month End NOT Reconciled"}
        </div>
        <div className="text-sm text-muted-foreground">
          {[
            !salesMatch && "Sales mismatch",
            !payoutsMatch && "Payouts mismatch",
            !receiptsMatch && "Receipts mismatch",
            !invoicesMatch && "Invoices mismatch",
            !vatMatch && "VAT mismatch",
          ]
            .filter(Boolean)
            .join(" • ") || "All figures agree ✓"}
        </div>
      </div>
    </div>
  );
}
