import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyDisplay } from "@/components/ui/CashupUI";
import { useCashupStore } from "@/store/cashupStore";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight } from "lucide-react";

interface AfsJournalEntriesProps {
  selectedDate: string;
  onNavigateToDate?: (date: string) => void;
}

export function AfsJournalEntries({ selectedDate, onNavigateToDate }: AfsJournalEntriesProps) {
  const month = selectedDate.slice(0, 7);
  const cashups = useCashupStore((s) => s.cashups);
  const managerEntries = useCashupStore((s) => s.managerEntries);
  const monthlyFigures = useCashupStore((s) => s.monthlyFigures);

  const je1 = useMemo(() => {
    const monthlyCashups = cashups.filter((c) => c.month === month);
    const monthlyManagers = managerEntries.filter((e) => e.date.startsWith(month));
    const mf = monthlyFigures.find((f) => f.month === month);

    // --- Credits from Month End Report (Other) - Sales Value (adj) ---
    const credits: { description: string; amount: number }[] = [];

    if (mf) {
      const totalVat = mf.vatTaxAmount + mf.adjVat;
      const totalGas = mf.salesGas + mf.adjGas;
      const totalOil = mf.salesOil + mf.adjOil;
      const totalCStore = mf.salesCStore + mf.adjCStore;
      const cStoreVatable = (totalVat / 0.15) - totalGas - totalOil;
      const cStoreNonVatable = totalCStore - cStoreVatable;

      credits.push({ description: "Sales C Store Vatable", amount: cStoreVatable });
      credits.push({ description: "Sales: C Store Exempt", amount: cStoreNonVatable });
      credits.push({ description: "Sales: WSL DSL (Exempt)", amount: mf.salesWslDsl + mf.adjWslDsl });
      credits.push({ description: "Sales Fuel", amount: mf.salesFuel + mf.adjFuel });
      credits.push({ description: "Sales Gas (excl Vat)", amount: totalGas });
      credits.push({ description: "Sales: Oil (excl Vat)", amount: totalOil });
      credits.push({ description: "VAT", amount: totalVat });
    }

    // Prov Blue Label = total Blue Label receipts
    let totalBlueLabel = 0;
    let totalEasypayReceipts = 0;
    let totalEasypayMop = 0;
    let totalLottoReceipts = 0;
    let totalDebtorsReceived = 0;
    let totalLottoPayouts = 0;
    let totalPayouts = 0;
    let totalCashDepositedBanking = 0;
    let totalCoins = 0;
    let totalSpeedpointsExclVPlus = 0;
    let totalVPlus = 0;
    let totalAccounts = 0;
    let totalOtherAdjustments = 0;
    let totalCashierBalance = 0;

    for (const c of monthlyCashups) {
      // Receipts
      for (const r of c.shop.receipts ?? []) {
        if (r.type === "Blue Label") totalBlueLabel += r.amount;
        if (r.type === "Easypay") totalEasypayReceipts += r.amount;
        if (r.type === "Lotto Receipts") totalLottoReceipts += r.amount;
        if (r.type === "Debtors Received on Account ROA") totalDebtorsReceived += r.amount;
      }
      // Easypay MOP Cash
      totalEasypayMop += c.shop.easyPay ?? 0;
      // Lotto payouts
      totalLottoPayouts += c.shop.lottoPayouts ?? 0;
      // Total payouts
      const shopPayoutsTotal = (c.shop.payouts ?? []).reduce((s, p) => s + p.amount, 0);
      totalPayouts += shopPayoutsTotal;
      // Cash deposited for banking
      totalCashDepositedBanking += c.shop.cashDepositedBanking ?? 0;
      // Coins
      totalCoins += c.shop.coins ?? 0;
      // Speedpoints - separate V Plus from others
      for (const sp of c.shop.speedpoints ?? []) {
        if (sp.terminal === "V Plus") {
          totalVPlus += (sp.shopAmount ?? 0) + (sp.optAmount ?? 0);
        } else {
          totalSpeedpointsExclVPlus += (sp.shopAmount ?? 0) + (sp.optAmount ?? 0);
        }
      }
      for (const sp of c.opt.speedpoints ?? []) {
        if (sp.terminal === "V Plus") {
          totalVPlus += (sp.optAmount ?? 0);
        } else {
          totalSpeedpointsExclVPlus += (sp.optAmount ?? 0);
        }
      }
      // Accounts (shop + opt)
      const shopAccTotal = (c.shop.accounts ?? []).reduce((s, a) => s + a.amount, 0);
      const optAccTotal = (c.opt.accounts ?? []).reduce((s, a) => s + a.amount, 0);
      totalAccounts += shopAccTotal + optAccTotal;
      // Other adjustments total (all Section 8 items)
      const otherAdj = (c.shop.otherAdjustments ?? []).reduce((s, o) => s + o.amount, 0);
      const section8Total = otherAdj + (c.shop.returns_mop ?? 0) + (c.shop.returnsNotCaptured ?? 0) + (c.shop.attendantShortOver ?? 0);
      totalOtherAdjustments += section8Total;
      // Cashier balance (shop + opt short/over)
      const shopNetSales = (c.shop.income ?? 0) - (c.shop.returns ?? 0) - (c.shop.returns_today ?? 0);
      const shopTotalReceipts = (c.shop.receipts ?? []).reduce((s, r) => s + r.amount, 0);
      const shopTotalTakings = shopNetSales - shopPayoutsTotal - (c.shop.lottoPayouts ?? 0) + shopTotalReceipts;
      const cashConnectTotal = (c.shop.cashDepositedBanking ?? 0) + (c.shop.easyPay ?? 0) + (c.shop.coins ?? 0);
      const shopSpTotal = (c.shop.speedpoints ?? []).reduce((s, sp) => s + sp.shopAmount, 0);
      const shopDiff = shopTotalTakings - cashConnectTotal - shopSpTotal - shopAccTotal - section8Total;
      const optNetSales = (c.opt.income ?? 0) - (c.opt.returns ?? 0);
      const optSpTotal = (c.opt.speedpoints ?? []).reduce((s, sp) => s + sp.optAmount, 0);
      const optDiff = optNetSales - optSpTotal - optAccTotal;
      totalCashierBalance += shopDiff + optDiff;
    }

    credits.push({ description: "Prov Blue Label", amount: totalBlueLabel });
    credits.push({ description: "Prov for Flash (Receipts)", amount: totalEasypayReceipts });
    credits.push({ description: "Prov for Lotto", amount: totalLottoReceipts - totalLottoPayouts });
    credits.push({ description: "Debtors Received on Account", amount: totalDebtorsReceived });

    // --- Debits ---
    const debits: { description: string; amount: number }[] = [
      { description: "Provision for Payouts", amount: totalPayouts },
      { description: "Shift Clearing", amount: totalCashDepositedBanking },
      { description: "Petty Cash", amount: totalCoins },
      { description: "EFT Clearing", amount: totalSpeedpointsExclVPlus },
      { description: "V Plus", amount: totalVPlus },
      { description: "Accounts", amount: totalAccounts },
      { description: "Prov for Flash (EasyPay MOP)", amount: totalEasypayMop },
    ];

    // Other Adjustments: debit if positive, credit if negative
    if (totalOtherAdjustments >= 0) {
      debits.push({ description: "Other Adjustments", amount: totalOtherAdjustments });
    } else {
      credits.push({ description: "Other Adjustments", amount: Math.abs(totalOtherAdjustments) });
    }

    // Cashier Balance: debit if positive, credit if negative
    if (totalCashierBalance >= 0) {
      debits.push({ description: "Cashier Balance", amount: totalCashierBalance });
    } else {
      credits.push({ description: "Cashier Balance", amount: Math.abs(totalCashierBalance) });
    }

    const totalCredits = credits.reduce((s, c) => s + c.amount, 0);
    const totalDebits = debits.reduce((s, d) => s + d.amount, 0);

    return { credits, debits, totalCredits, totalDebits };
  }, [month, cashups, managerEntries, monthlyFigures]);

  // ── JE 2.1 (EFT) & JE 2.2 (Payouts) — Invoices split by source ──
  // Simplified for Xero entry: one row per category, showing total Incl. VAT
  // and total No VAT amounts. Expand for line-item detail.
  const { je2Eft, je2Payouts } = useMemo(() => {
    const monthlyManagers = managerEntries.filter((e) => e.date.startsWith(month));

    type Txn = { date: string; supplier: string; source: "Payout" | "EFT"; amount: number; inclVatPortion: number; noVatPortion: number };

    const splitAmounts = (category: string, inclusive: number, vat: number) => {
      const isExempt = /fuel|wsl|dsl/i.test(category);
      if (isExempt) {
        const vatablePortion = vat > 0 ? (vat / 0.15) * 1.15 : 0;
        return { inclVatPortion: vatablePortion, noVatPortion: inclusive - vatablePortion };
      }
      const hasVat = (vat ?? 0) > 0 || inclusive < 0;
      return hasVat
        ? { inclVatPortion: inclusive, noVatPortion: 0 }
        : { inclVatPortion: 0, noVatPortion: inclusive };
    };

    const build = (source: "Payout" | "EFT") => {
      const catMap: Record<string, { inclVat: number; noVat: number; transactions: Txn[] }> = {};
      const push = (cat: string, txn: Txn) => {
        if (!catMap[cat]) catMap[cat] = { inclVat: 0, noVat: 0, transactions: [] };
        catMap[cat].inclVat += txn.inclVatPortion;
        catMap[cat].noVat += txn.noVatPortion;
        catMap[cat].transactions.push(txn);
      };

      monthlyManagers.forEach((e) => {
        const invoices = source === "Payout" ? e.payoutInvoices : e.eftInvoices;
        invoices.forEach((inv) => {
          const cat = inv.category || "Uncategorised";
          const { inclVatPortion, noVatPortion } = splitAmounts(cat, inv.inclusive, inv.vat ?? 0);
          push(cat, { date: e.date, supplier: inv.supplier, source, amount: inv.inclusive, inclVatPortion, noVatPortion });
        });
      });

      const categories = Object.entries(catMap)
        .sort((a, b) => (b[1].inclVat + b[1].noVat) - (a[1].inclVat + a[1].noVat))
        .map(([category, v]) => ({
          category,
          inclVat: v.inclVat,
          noVat: v.noVat,
          total: v.inclVat + v.noVat,
          transactions: v.transactions.sort((a, b) => a.date.localeCompare(b.date)),
        }));

      const totals = categories.reduce(
        (a, r) => ({ inclVat: a.inclVat + r.inclVat, noVat: a.noVat + r.noVat, total: a.total + r.total }),
        { inclVat: 0, noVat: 0, total: 0 }
      );

      return { categories, totals };
    };

    return { je2Eft: build("EFT"), je2Payouts: build("Payout") };
  }, [month, managerEntries]);


  const [expandedPayoutCats, setExpandedPayoutCats] = useState<Set<string>>(new Set());
  const [expandedEftCats, setExpandedEftCats] = useState<Set<string>>(new Set());

  // Adjustment explanations state (persisted via master_data)
  const [je1Explanation, setJe1Explanation] = useState('');
  const [je2_1Explanation, setJe2_1Explanation] = useState('');
  const [je2_2Explanation, setJe2_2Explanation] = useState('');
  const [je3Explanation, setJe3Explanation] = useState('');
  const [je4Explanation, setJe4Explanation] = useState('');
  const [je5Explanation, setJe5Explanation] = useState('');

  useEffect(() => {
    const key = `je_explanations_${month}`;
    supabase.from('master_data').select('data').eq('key', key).maybeSingle().then(({ data }) => {
      if (data?.data) {
        const d = data.data as Record<string, string>;
        setJe1Explanation(d.je1 ?? '');
        setJe2_1Explanation(d.je2_1 ?? '');
        setJe2_2Explanation(d.je2_2 ?? '');
        setJe3Explanation(d.je3 ?? '');
        setJe4Explanation(d.je4 ?? '');
        setJe5Explanation(d.je5 ?? '');
      } else {
        setJe1Explanation('');
        setJe2_1Explanation('');
        setJe2_2Explanation('');
        setJe3Explanation('');
        setJe4Explanation('');
        setJe5Explanation('');
      }
    });
  }, [month]);


  const togglePayoutCat = (cat: string) => {
    setExpandedPayoutCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };
  const toggleEftCat = (cat: string) => {
    setExpandedEftCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const saveExplanation = (field: 'je1' | 'je2_1' | 'je2_2' | 'je3' | 'je4' | 'je5', value: string) => {
    const key = `je_explanations_${month}`;
    const current = { je1: je1Explanation, je2_1: je2_1Explanation, je2_2: je2_2Explanation, je3: je3Explanation, je4: je4Explanation, je5: je5Explanation, [field]: value };
    supabase.from('master_data').upsert({ key, data: current as any }, { onConflict: 'key' }).then();
  };


  // ── JE 3 — Debtors Writeoff ──
  const je3 = useMemo(() => {
    const monthlyCashups = cashups.filter((c) => c.month === month);
    const writeoffAccounts: { account: string; debitLabel: string }[] = [
      { account: "Generator", debitLabel: "Generator" },
      { account: "Shop Expense", debitLabel: "Shop Expense" },
      { account: "Umesh", debitLabel: "Staff Refreshments" },
    ];
    const debits: { description: string; amount: number }[] = [];

    for (const { account, debitLabel } of writeoffAccounts) {
      let total = 0;
      for (const c of monthlyCashups) {
        for (const a of c.shop.accounts ?? []) {
          if (a.name === account) total += a.amount;
        }
        for (const a of c.opt.accounts ?? []) {
          if (a.name === account) total += a.amount;
        }
      }
      debits.push({ description: debitLabel, amount: total });
    }

    const totalDebits = debits.reduce((s, d) => s + d.amount, 0);
    return { debits, totalDebits };
  }, [month, cashups]);

  // ── JE 4 — Coins Banked ──
  const je4 = useMemo(() => {
    const monthlyManagers = managerEntries.filter((e) => e.date.startsWith(month));
    const totalTransferFromCoins = monthlyManagers.reduce(
      (s, e) => s + Math.abs(e.transferFromCoins ?? 0),
      0
    );
    const mf = monthlyFigures.find((f) => f.month === month);
    const ccBankCharges = mf?.cashConnectInvoiceInclVat ?? 0;
    return { amount: totalTransferFromCoins, ccBankCharges };
  }, [month, managerEntries, monthlyFigures]);

  // ── JE 5 — Airtime / Lotto Commissions ──
  const je5 = useMemo(() => {
    const monthlyManagers = managerEntries.filter((e) => e.date.startsWith(month));
    let blueLabel = 0;
    let easyPay = 0;
    let lotto = 0;
    for (const e of monthlyManagers) {
      blueLabel += e.blueLabelComm ?? 0;
      easyPay += e.easypayComm ?? 0;
      lotto += e.lottoComm ?? 0;
    }
    const totalDebits = blueLabel + lotto + easyPay;
    const totalCredits = 0;
    const loanUb = totalDebits - totalCredits; // positive = credit Loan UB to balance
    return { blueLabel, easyPay, lotto, totalDebits, totalCredits, loanUb };
  }, [month, managerEntries]);


  return (
    <div className="space-y-6">
      {/* JE 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">JE 1 — Monthly Turnover ({month})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Debit</TableHead>
                <TableHead className="text-xs text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {je1.debits.map((d) => (
                <TableRow key={d.description}>
                  <TableCell className="text-sm py-1.5">{d.description}</TableCell>
                  <TableCell className="text-right py-1.5">
                    <CurrencyDisplay value={d.amount} />
                  </TableCell>
                  <TableCell className="text-right py-1.5" />
                </TableRow>
              ))}
              {je1.credits.map((c) => (
                <TableRow key={c.description}>
                  <TableCell className="text-sm py-1.5">{c.description}</TableCell>
                  <TableCell className="text-right py-1.5" />
                  <TableCell className="text-right py-1.5">
                    <CurrencyDisplay value={c.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold text-sm">Totals</TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={je1.totalDebits} highlight />
                </TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={je1.totalCredits} highlight />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-semibold text-sm">Difference</TableCell>
                <TableCell className="text-right" colSpan={2}>
                  <CurrencyDisplay value={je1.totalDebits - je1.totalCredits} highlight />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">Adjustment Explanations</label>
            <Textarea
              value={je1Explanation}
              onChange={(e) => setJe1Explanation(e.target.value)}
              onBlur={() => saveExplanation('je1', je1Explanation)}
              placeholder="Enter adjustment explanations for JE 1..."
              className="mt-1 min-h-[60px] text-sm"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">JE 2.1 — EFT Invoices ({month})</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            EFT invoices as a journal entry. Each category is debited to its Cost of Sales
            account (split by VAT treatment) and credited to Fuel Clearing (Fuel / WSL DSL)
            or Trade Creditors (all other categories).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const isFuelClearing = (cat: string) => /fuel|wsl|dsl/i.test(cat);
            type DebitRow = { label: string; amount: number };
            const debits: DebitRow[] = [];
            let fuelClearingF2K = 0;
            let fuelClearingShell = 0;
            let tradeCreditorsTotal = 0;

            je2Eft.categories.forEach((r) => {
              const fuel = isFuelClearing(r.category);
              if (fuel) {
                if (r.inclVat !== 0) debits.push({ label: `COS ${r.category} (Incl Vat)`, amount: r.inclVat });
                if (r.noVat !== 0) debits.push({ label: `COS ${r.category} (Exempt)`, amount: r.noVat });
                r.transactions.forEach((t) => {
                  const amt = t.inclVatPortion + t.noVatPortion;
                  if (/f2k/i.test(t.supplier)) fuelClearingF2K += amt;
                  else fuelClearingShell += amt;
                });
              } else {
                if (r.inclVat !== 0) debits.push({ label: `COS ${r.category} (Incl Vat)`, amount: r.inclVat });
                if (r.noVat !== 0) debits.push({ label: `COS ${r.category} (No Vat)`, amount: r.noVat });
                tradeCreditorsTotal += r.inclVat + r.noVat;
              }
            });

            const totalDebits = debits.reduce((s, d) => s + d.amount, 0);
            const totalCredits = fuelClearingF2K + fuelClearingShell + tradeCreditorsTotal;

            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs text-right">Debit</TableHead>
                    <TableHead className="text-xs text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debits.map((d, i) => (
                    <TableRow key={`d-${i}`}>
                      <TableCell className="text-sm py-1.5">{d.label}</TableCell>
                      <TableCell className="text-right py-1.5"><CurrencyDisplay value={d.amount} /></TableCell>
                      <TableCell className="text-right py-1.5" />
                    </TableRow>
                  ))}
                  {fuelClearingF2K !== 0 && (
                    <TableRow>
                      <TableCell className="text-sm py-1.5">Fuel Clearing F2K</TableCell>
                      <TableCell className="text-right py-1.5" />
                      <TableCell className="text-right py-1.5"><CurrencyDisplay value={fuelClearingF2K} /></TableCell>
                    </TableRow>
                  )}
                  {fuelClearingShell !== 0 && (
                    <TableRow>
                      <TableCell className="text-sm py-1.5">Fuel Clearing Shell</TableCell>
                      <TableCell className="text-right py-1.5" />
                      <TableCell className="text-right py-1.5"><CurrencyDisplay value={fuelClearingShell} /></TableCell>
                    </TableRow>
                  )}
                  {tradeCreditorsTotal !== 0 && (
                    <TableRow>
                      <TableCell className="text-sm py-1.5">Trade Creditors</TableCell>
                      <TableCell className="text-right py-1.5" />
                      <TableCell className="text-right py-1.5"><CurrencyDisplay value={tradeCreditorsTotal} /></TableCell>
                    </TableRow>
                  )}
                </TableBody>

                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold text-sm">Totals</TableCell>
                    <TableCell className="text-right"><CurrencyDisplay value={totalDebits} highlight /></TableCell>
                    <TableCell className="text-right"><CurrencyDisplay value={totalCredits} highlight /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-semibold text-sm">Difference</TableCell>
                    <TableCell className="text-right" colSpan={2}>
                      <CurrencyDisplay value={totalDebits - totalCredits} highlight />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            );
          })()}
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">Adjustment Explanations</label>
            <Textarea
              value={je2_1Explanation}
              onChange={(e) => setJe2_1Explanation(e.target.value)}
              onBlur={() => saveExplanation('je2_1', je2_1Explanation)}
              placeholder="Enter adjustment explanations for JE 2.1..."
              className="mt-1 min-h-[60px] text-sm"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">JE 2.2 — Payout Invoices ({month})</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Payout invoices by category. Amounts are inclusive — enter the Incl. VAT
            column against a VAT tax rate in Xero, and the No VAT column against a no-VAT rate.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            type DebitRow = { label: string; amount: number };
            const debits: DebitRow[] = [];

            je2Payouts.categories.forEach((r) => {
              const isExempt = /fuel|wsl|dsl/i.test(r.category);
              if (r.inclVat !== 0) debits.push({ label: `COS ${r.category} (Incl Vat)`, amount: r.inclVat });
              if (r.noVat !== 0) debits.push({ label: `COS ${r.category} ${isExempt ? "(Exempt)" : "(No Vat)"}`, amount: r.noVat });
            });

            const totalDebits = debits.reduce((s, d) => s + d.amount, 0);
            const provPayoutsJe1 = je1.debits.find((d) => d.description === "Provision for Payouts")?.amount ?? 0;
            const variance = totalDebits - provPayoutsJe1;
            const hasException = Math.abs(variance) > 0.01;

            return (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right">Debit</TableHead>
                      <TableHead className="text-xs text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debits.map((d, i) => (
                      <TableRow key={`d-${i}`}>
                        <TableCell className="text-sm py-1.5">{d.label}</TableCell>
                        <TableCell className="text-right py-1.5"><CurrencyDisplay value={d.amount} /></TableCell>
                        <TableCell className="text-right py-1.5" />
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="text-sm py-1.5">Prov for Payouts</TableCell>
                      <TableCell className="text-right py-1.5" />
                      <TableCell className="text-right py-1.5"><CurrencyDisplay value={totalDebits} /></TableCell>
                    </TableRow>
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold text-sm">Totals</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={totalDebits} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={totalDebits} highlight /></TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
                {hasException && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs">
                    <div className="font-semibold text-destructive mb-1">Exception: Prov for Payouts mismatch</div>
                    <div className="text-muted-foreground">
                      JE 2.2 Prov for Payouts (<CurrencyDisplay value={totalDebits} />) does not equal
                      JE 1 Provision for Payouts (<CurrencyDisplay value={provPayoutsJe1} />).
                      Variance: <CurrencyDisplay value={variance} />
                    </div>
                  </div>
                )}
              </>
            );
          })()}
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">Adjustment Explanations</label>
            <Textarea
              value={je2_2Explanation}
              onChange={(e) => setJe2_2Explanation(e.target.value)}
              onBlur={() => saveExplanation('je2_2', je2_2Explanation)}
              placeholder="Enter adjustment explanations for JE 2.2..."
              className="mt-1 min-h-[60px] text-sm"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">JE 3 — Debtors Writeoff ({month})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Debit</TableHead>
                <TableHead className="text-xs text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {je3.debits.map((d) => (
                <TableRow key={d.description}>
                  <TableCell className="text-sm py-1.5">{d.description}</TableCell>
                  <TableCell className="text-right py-1.5">
                    <CurrencyDisplay value={d.amount} />
                  </TableCell>
                  <TableCell className="text-right py-1.5" />
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="text-sm py-1.5">Debtors</TableCell>
                <TableCell className="text-right py-1.5" />
                <TableCell className="text-right py-1.5">
                  <CurrencyDisplay value={je3.totalDebits} />
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold text-sm">Totals</TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={je3.totalDebits} highlight />
                </TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={je3.totalDebits} highlight />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">Adjustment Explanations</label>
            <Textarea
              value={je3Explanation}
              onChange={(e) => setJe3Explanation(e.target.value)}
              onBlur={() => saveExplanation('je3', je3Explanation)}
              placeholder="Enter adjustment explanations for JE 3..."
              className="mt-1 min-h-[60px] text-sm"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">JE 4 — Coins Banked ({month})+ CC Bank Charges</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Debit</TableHead>
                <TableHead className="text-xs text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-sm py-1.5">Shift Clearing</TableCell>
                <TableCell className="text-right py-1.5">
                  <CurrencyDisplay value={je4.amount} />
                </TableCell>
                <TableCell className="text-right py-1.5" />
              </TableRow>
              <TableRow>
                <TableCell className="text-sm py-1.5">Petty Cash</TableCell>
                <TableCell className="text-right py-1.5" />
                <TableCell className="text-right py-1.5">
                  <CurrencyDisplay value={je4.amount} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-sm py-1.5">Bank Charges (CDF) Incl</TableCell>
                <TableCell className="text-right py-1.5">
                  <CurrencyDisplay value={je4.ccBankCharges} />
                </TableCell>
                <TableCell className="text-right py-1.5" />
              </TableRow>
              <TableRow>
                <TableCell className="text-sm py-1.5">Shift Clearing</TableCell>
                <TableCell className="text-right py-1.5" />
                <TableCell className="text-right py-1.5">
                  <CurrencyDisplay value={je4.ccBankCharges} />
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold text-sm">Totals</TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={je4.amount + je4.ccBankCharges} highlight />
                </TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={je4.amount + je4.ccBankCharges} highlight />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">Adjustment Explanations</label>
            <Textarea
              value={je4Explanation}
              onChange={(e) => setJe4Explanation(e.target.value)}
              onBlur={() => saveExplanation('je4', je4Explanation)}
              placeholder="Enter adjustment explanations for JE 4..."
              className="mt-1 min-h-[60px] text-sm"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">JE 5 — Airtime / Lotto Commissions ({month})</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Monthly commissions from the Airtime / Lotto Reconciliation. Blue Label and Lotto
            commissions are debited; Easy Pay commission is credited.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Debit</TableHead>
                <TableHead className="text-xs text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-sm py-1.5">Blue Label Commission</TableCell>
                <TableCell className="text-right py-1.5"><CurrencyDisplay value={je5.blueLabel} /></TableCell>
                <TableCell className="text-right py-1.5" />
              </TableRow>
              <TableRow>
                <TableCell className="text-sm py-1.5">Lotto Commission (Net Sales + Payout + Adj)</TableCell>
                <TableCell className="text-right py-1.5"><CurrencyDisplay value={je5.lotto} /></TableCell>
                <TableCell className="text-right py-1.5" />
              </TableRow>
              <TableRow>
                <TableCell className="text-sm py-1.5">Easy Pay Commission</TableCell>
                <TableCell className="text-right py-1.5" />
                <TableCell className="text-right py-1.5"><CurrencyDisplay value={je5.easyPay} /></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-sm py-1.5">Loan UB</TableCell>
                <TableCell className="text-right py-1.5">
                  {je5.loanUb < 0 ? <CurrencyDisplay value={-je5.loanUb} /> : null}
                </TableCell>
                <TableCell className="text-right py-1.5">
                  {je5.loanUb >= 0 ? <CurrencyDisplay value={je5.loanUb} /> : null}
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold text-sm">Totals</TableCell>
                <TableCell className="text-right"><CurrencyDisplay value={je5.totalDebits + (je5.loanUb < 0 ? -je5.loanUb : 0)} highlight /></TableCell>
                <TableCell className="text-right"><CurrencyDisplay value={je5.totalCredits + (je5.loanUb >= 0 ? je5.loanUb : 0)} highlight /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">Adjustment Explanations</label>
            <Textarea
              value={je5Explanation}
              onChange={(e) => setJe5Explanation(e.target.value)}
              onBlur={() => saveExplanation('je5', je5Explanation)}
              placeholder="Enter adjustment explanations for JE 5..."
              className="mt-1 min-h-[60px] text-sm"
            />
          </div>
        </CardContent>
      </Card>
    </div>

  );
}
