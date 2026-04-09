import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyDisplay } from "@/components/ui/CashupUI";
import { useCashupStore } from "@/store/cashupStore";

interface AfsJournalEntriesProps {
  selectedDate: string;
}

export function AfsJournalEntries({ selectedDate }: AfsJournalEntriesProps) {
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
      credits.push({ description: "C Store", amount: mf.salesCStore + mf.adjCStore });
      credits.push({ description: "WSL DSL", amount: mf.salesWslDsl + mf.adjWslDsl });
      credits.push({ description: "Fuel", amount: mf.salesFuel + mf.adjFuel });
      credits.push({ description: "Gas", amount: mf.salesGas + mf.adjGas });
      credits.push({ description: "Oil", amount: mf.salesOil + mf.adjOil });
      credits.push({ description: "VAT", amount: mf.vatTaxAmount + mf.adjVat });
    }

    // Prov Blue Label = total Blue Label receipts
    let totalBlueLabel = 0;
    let totalEasypayReceipts = 0;
    let totalEasypayMop = 0;
    let totalLottoReceipts = 0;
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
      const shopSection8 = otherAdj + (c.shop.returns_mop ?? 0) + (c.shop.returnsNotCaptured ?? 0) + (c.shop.attendantShortOver ?? 0);
      const shopDiff = shopTotalTakings - cashConnectTotal - shopSpTotal - shopAccTotal - shopSection8;
      const optNetSales = (c.opt.income ?? 0) - (c.opt.returns ?? 0);
      const optSpTotal = (c.opt.speedpoints ?? []).reduce((s, sp) => s + sp.optAmount, 0);
      const optDiff = optNetSales - optSpTotal - optAccTotal;
      totalCashierBalance += shopDiff + optDiff;
    }

    credits.push({ description: "Prov Blue Label", amount: totalBlueLabel });
    credits.push({ description: "Prov for Flash (Receipts)", amount: totalEasypayReceipts });
    credits.push({ description: "Prov for Lotto", amount: totalLottoReceipts - totalLottoPayouts });

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

  return (
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
            {/* Debits */}
            {je1.debits.map((d) => (
              <TableRow key={d.description}>
                <TableCell className="text-sm py-1.5">{d.description}</TableCell>
                <TableCell className="text-right py-1.5">
                  <CurrencyDisplay value={d.amount} />
                </TableCell>
                <TableCell className="text-right py-1.5" />
              </TableRow>
            ))}
            {/* Credits */}
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
      </CardContent>
    </Card>
  );
}
