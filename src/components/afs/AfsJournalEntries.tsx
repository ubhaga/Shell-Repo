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

      credits.push({ description: "C Store Vatable", amount: cStoreVatable });
      credits.push({ description: "C Store Non Vatable", amount: cStoreNonVatable });
      credits.push({ description: "WSL DSL", amount: mf.salesWslDsl + mf.adjWslDsl });
      credits.push({ description: "Fuel", amount: mf.salesFuel + mf.adjFuel });
      credits.push({ description: "Gas", amount: totalGas });
      credits.push({ description: "Oil", amount: totalOil });
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
      { description: "Payouts", amount: totalPayouts },
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

  // ── JE 2 — Invoices (Payouts + EFTs combined) ──
  // Simplified for Xero entry: one row per category, showing total Incl. VAT
  // and total No VAT amounts. Expand for line-item detail.
  const je2 = useMemo(() => {
    const monthlyManagers = managerEntries.filter((e) => e.date.startsWith(month));

    type Txn = { date: string; supplier: string; source: "Payout" | "EFT"; amount: number; hasVat: boolean };
    const catMap: Record<string, { inclVat: number; noVat: number; transactions: Txn[] }> = {};

    const push = (cat: string, txn: Txn) => {
      if (!catMap[cat]) catMap[cat] = { inclVat: 0, noVat: 0, transactions: [] };
      if (txn.hasVat) catMap[cat].inclVat += txn.amount;
      else catMap[cat].noVat += txn.amount;
      catMap[cat].transactions.push(txn);
    };

    monthlyManagers.forEach((e) => {
      e.payoutInvoices.forEach((inv) => {
        push(inv.category || "Uncategorised", {
          date: e.date, supplier: inv.supplier, source: "Payout",
          amount: inv.inclusive, hasVat: (inv.vat ?? 0) > 0,
        });
      });
      e.eftInvoices.forEach((inv) => {
        push(inv.category || "Uncategorised", {
          date: e.date, supplier: inv.supplier, source: "EFT",
          amount: inv.inclusive, hasVat: (inv.vat ?? 0) > 0,
        });
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
  }, [month, managerEntries]);

  const [expandedPayoutCats, setExpandedPayoutCats] = useState<Set<string>>(new Set());
  const [expandedEftCats, setExpandedEftCats] = useState<Set<string>>(new Set());

  // Adjustment explanations state (persisted via master_data)
  const [je1Explanation, setJe1Explanation] = useState('');
  const [je2Explanation, setJe2Explanation] = useState('');
  const [je3Explanation, setJe3Explanation] = useState('');
  const [je4Explanation, setJe4Explanation] = useState('');

  useEffect(() => {
    const key = `je_explanations_${month}`;
    supabase.from('master_data').select('data').eq('key', key).maybeSingle().then(({ data }) => {
      if (data?.data) {
        const d = data.data as Record<string, string>;
        setJe1Explanation(d.je1 ?? '');
        setJe2Explanation(d.je2 ?? '');
        setJe3Explanation(d.je3 ?? '');
        setJe4Explanation(d.je4 ?? '');
      } else {
        setJe1Explanation('');
        setJe2Explanation('');
        setJe3Explanation('');
        setJe4Explanation('');
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

  const saveExplanation = (field: 'je1' | 'je2' | 'je3' | 'je4', value: string) => {
    const key = `je_explanations_${month}`;
    const current = { je1: je1Explanation, je2: je2Explanation, je3: je3Explanation, je4: je4Explanation, [field]: value };
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
    return { amount: totalTransferFromCoins };
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
          <CardTitle className="text-base">JE 2 — Invoices & Payouts ({month})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Payouts by Category */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Payouts — Summary by Category</h4>
            <Table>
              <TableHeader>
                <TableRow>
                 <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right">Debit (Excl. VAT)</TableHead>
                  <TableHead className="text-xs text-right">Debit (VAT)</TableHead>
                  <TableHead className="text-xs text-right">Debit (No VAT)</TableHead>
                  <TableHead className="text-xs text-right">Credit (Payouts)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {je2.payoutCategories.map((r) => {
                  const exclVat = r.vat / 0.15;
                  const noVat = r.incl - exclVat - r.vat;
                  return (
                  <React.Fragment key={r.category}>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => togglePayoutCat(r.category)}>
                      <TableCell className="text-sm py-1.5">
                        <span className="inline-flex items-center gap-1">
                          {expandedPayoutCats.has(r.category) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {r.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-1.5">
                        <CurrencyDisplay value={exclVat} />
                      </TableCell>
                      <TableCell className="text-right py-1.5">
                        <CurrencyDisplay value={r.vat} />
                      </TableCell>
                      <TableCell className="text-right py-1.5">
                        <CurrencyDisplay value={noVat} />
                      </TableCell>
                      <TableCell className="text-right py-1.5" />
                    </TableRow>
                    {expandedPayoutCats.has(r.category) && r.transactions.map((t, i) => {
                      const tExclVat = t.vat / 0.15;
                      const tNoVat = t.amount - tExclVat - t.vat;
                      return (
                      <TableRow
                        key={`${r.category}-${i}`}
                        className="cursor-pointer hover:bg-accent/50 bg-muted/30"
                        onClick={() => onNavigateToDate?.(t.date)}
                      >
                        <TableCell className="text-xs py-1 pl-10 text-muted-foreground">{t.date} — {t.vendor}</TableCell>
                        <TableCell className="text-right text-xs py-1 text-muted-foreground">
                          <CurrencyDisplay value={tExclVat} />
                        </TableCell>
                        <TableCell className="text-right text-xs py-1 text-muted-foreground">
                          <CurrencyDisplay value={t.vat} />
                        </TableCell>
                        <TableCell className="text-right text-xs py-1 text-muted-foreground">
                          <CurrencyDisplay value={tNoVat} />
                        </TableCell>
                        <TableCell className="text-right text-xs py-1 text-muted-foreground">
                          <CurrencyDisplay value={t.amount} />
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </React.Fragment>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold text-sm">Payouts Total</TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={je2.payoutTotals.vat / 0.15} highlight />
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={je2.payoutTotals.vat} highlight />
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={je2.payoutTotals.incl - je2.payoutTotals.vat / 0.15 - je2.payoutTotals.vat} highlight />
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={je2.payoutTotals.incl} highlight />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* EFTs by Category */}
          <div>
            <h4 className="text-sm font-semibold mb-2">EFTs — Summary by Category</h4>
            <Table>
              <TableHeader>
                <TableRow>
                 <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right">Debit (Excl. VAT)</TableHead>
                  <TableHead className="text-xs text-right">Debit (VAT)</TableHead>
                  <TableHead className="text-xs text-right">Debit (No VAT)</TableHead>
                  <TableHead className="text-xs text-right">Credit (Bank)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {je2.eftCategories.map((r) => {
                  const exclVat = r.vat / 0.15;
                  const noVat = r.incl - exclVat - r.vat;
                  return (
                  <React.Fragment key={r.category}>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleEftCat(r.category)}>
                      <TableCell className="text-sm py-1.5">
                        <span className="inline-flex items-center gap-1">
                          {expandedEftCats.has(r.category) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {r.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-1.5">
                        <CurrencyDisplay value={exclVat} />
                      </TableCell>
                      <TableCell className="text-right py-1.5">
                        <CurrencyDisplay value={r.vat} />
                      </TableCell>
                      <TableCell className="text-right py-1.5">
                        <CurrencyDisplay value={noVat} />
                      </TableCell>
                      <TableCell className="text-right py-1.5" />
                    </TableRow>
                    {expandedEftCats.has(r.category) && r.transactions.map((t, i) => {
                      const tExclVat = t.vat / 0.15;
                      const tNoVat = t.inclusive - tExclVat - t.vat;
                      return (
                      <TableRow
                        key={`${r.category}-${i}`}
                        className="cursor-pointer hover:bg-accent/50 bg-muted/30"
                        onClick={() => onNavigateToDate?.(t.date)}
                      >
                        <TableCell className="text-xs py-1 pl-10 text-muted-foreground">{t.date} — {t.supplier}</TableCell>
                        <TableCell className="text-right text-xs py-1 text-muted-foreground">
                          <CurrencyDisplay value={tExclVat} />
                        </TableCell>
                        <TableCell className="text-right text-xs py-1 text-muted-foreground">
                          <CurrencyDisplay value={t.vat} />
                        </TableCell>
                        <TableCell className="text-right text-xs py-1 text-muted-foreground">
                          <CurrencyDisplay value={tNoVat} />
                        </TableCell>
                        <TableCell className="text-right text-xs py-1 text-muted-foreground">
                          <CurrencyDisplay value={t.inclusive} />
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </React.Fragment>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold text-sm">EFTs Total</TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={je2.eftTotals.vat / 0.15} highlight />
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={je2.eftTotals.vat} highlight />
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={je2.eftTotals.incl - je2.eftTotals.vat / 0.15 - je2.eftTotals.vat} highlight />
                  </TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay value={je2.eftTotals.incl} highlight />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
           </div>
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">Adjustment Explanations</label>
            <Textarea
              value={je2Explanation}
              onChange={(e) => setJe2Explanation(e.target.value)}
              onBlur={() => saveExplanation('je2', je2Explanation)}
              placeholder="Enter adjustment explanations for JE 2..."
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
          <CardTitle className="text-base">JE 4 — Coins Banked ({month})</CardTitle>
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
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold text-sm">Totals</TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={je4.amount} highlight />
                </TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={je4.amount} highlight />
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
    </div>

  );
}
