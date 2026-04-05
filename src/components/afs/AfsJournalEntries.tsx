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
      for (const p of c.shop.payouts ?? []) {
        totalPayouts += p.amount;
      }
      // Cash deposited for banking
      totalCashDepositedBanking += c.shop.cashDepositedBanking ?? 0;
      // Coins
      totalCoins += c.shop.coins ?? 0;
      // Speedpoints (except V Plus) - shop + opt amounts
      for (const sp of c.shop.speedpoints ?? []) {
        if (sp.terminal !== "V Plus") {
          totalSpeedpointsExclVPlus += (sp.shopAmount ?? 0) + (sp.optAmount ?? 0);
        }
      }
    }

    credits.push({ description: "Prov Blue Label", amount: totalBlueLabel });
    credits.push({ description: "Prov for Flash", amount: totalEasypayReceipts - totalEasypayMop });
    credits.push({ description: "Prov for Lotto", amount: totalLottoReceipts - totalLottoPayouts });

    // --- Bank charges from manager entries ---
    let totalBankCharges = 0;
    for (const me of monthlyManagers) {
      totalBankCharges += me.bankCharges ?? 0;
    }

    // --- Debits ---
    const debits: { description: string; amount: number }[] = [
      { description: "Payouts", amount: totalPayouts },
      { description: "Shift Clearing", amount: totalCashDepositedBanking - totalBankCharges },
      { description: "Petty Cash", amount: totalCoins },
      { description: "EFT Clearing", amount: totalSpeedpointsExclVPlus },
    ];

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
