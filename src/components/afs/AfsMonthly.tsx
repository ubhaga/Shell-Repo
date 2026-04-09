import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyDisplay } from "@/components/ui/CashupUI";
import { useCashupStore } from "@/store/cashupStore";
import { format, parseISO, addDays, lastDayOfMonth } from "date-fns";
import type { ManagerDailyEntry } from "@/types/cashup";

interface AfsMonthlyProps {
  selectedDate: string;
}

// Reuse the chain-walking logic from ManagerDailyForm
interface EffectiveClosing {
  coins: number;
  easypay: number;
  cc: number;
}

function computeEffectiveClosingForDate(
  targetDate: string,
  getEntry: (d: string) => ManagerDailyEntry | undefined,
  getCashup: (d: string) => { shop: { coins: number; easyPay: number; cashDepositedBanking: number } } | undefined,
): EffectiveClosing | null {
  const SEED_DATE = "2026-01-01";
  if (targetDate < SEED_DATE) return null;

  const dates: string[] = [];
  let d = parseISO(SEED_DATE);
  const end = parseISO(targetDate);
  while (d <= end) {
    dates.push(format(d, "yyyy-MM-dd"));
    d = addDays(d, 1);
  }

  let coinsOpening = 4483.15;
  let easypayOpening = 3500;
  let ccOpening = 2000;

  for (const date of dates) {
    const entry = getEntry(date);
    const cashup = getCashup(date);

    let effCoinsOpen: number, effEasypayOpen: number, effCCOpen: number;
    if (date === SEED_DATE) {
      effCoinsOpen = 4483.15;
      effEasypayOpen = 3500;
      effCCOpen = 2000;
    } else {
      effCoinsOpen = coinsOpening;
      effEasypayOpen = easypayOpening;
      effCCOpen = ccOpening;
    }

    const dailyCoins = cashup?.shop.coins ?? 0;
    const dailyEasypay = cashup?.shop.easyPay ?? 0;
    const dailyCC = cashup?.shop.cashDepositedBanking ?? 0;
    const closureCoins = Math.abs(entry?.ccBagClosureCoins ?? 0);
    const closureEasypay = Math.abs(entry?.ccBagClosureEasypay ?? 0);
    const closureCC = Math.abs(entry?.ccBagClosureCashConnect ?? 0);
    const transferFromCoins = Math.abs(entry?.transferFromCoins ?? 0);

    coinsOpening = effCoinsOpen + dailyCoins - closureCoins - transferFromCoins;
    easypayOpening = effEasypayOpen + dailyEasypay - closureEasypay;
    ccOpening = effCCOpen + dailyCC - closureCC + transferFromCoins;
  }

  return { coins: coinsOpening, easypay: easypayOpening, cc: ccOpening };
}

export function AfsMonthly({ selectedDate }: AfsMonthlyProps) {
  const month = selectedDate.slice(0, 7);
  const cashups = useCashupStore((s) => s.cashups);
  const managerEntries = useCashupStore((s) => s.managerEntries);
  const monthlyFigures = useCashupStore((s) => s.monthlyFigures);

  // ── Income Statement ──
  const incomeStatement = useMemo(() => {
    const mf = monthlyFigures.find((f) => f.month === month);
    const monthlyCashups = cashups.filter((c) => c.month === month);
    const monthlyManagers = managerEntries.filter((e) => e.date.startsWith(month));

    // Sales from JE 1 credits (adjusted sales values)
    const sales = [
      { description: "Sales Fuel", amount: mf ? mf.salesFuel + mf.adjFuel : 0 },
      { description: "Sales WSL DSL", amount: mf ? mf.salesWslDsl + mf.adjWslDsl : 0 },
      { description: "Sales C Store", amount: mf ? mf.salesCStore + mf.adjCStore : 0 },
      { description: "Sales Gas", amount: mf ? mf.salesGas + mf.adjGas : 0 },
      { description: "Sales Oil", amount: mf ? mf.salesOil + mf.adjOil : 0 },
    ];
    const totalSales = sales.reduce((s, r) => s + r.amount, 0);

    // COS from JE 2 — match categories containing "COS" + department name
    // Build JE2 payout+EFT category map (same logic as AfsJournalEntries)
    const managerPayoutByVendor = new Map<string, Map<string, { count: number; entries: { category: string; vat: number }[] }>>();
    monthlyManagers.forEach((e) => {
      e.payoutInvoices.forEach((inv) => {
        const vendor = inv.supplier.toLowerCase().trim();
        if (!managerPayoutByVendor.has(vendor)) managerPayoutByVendor.set(vendor, new Map());
        const dateMap = managerPayoutByVendor.get(vendor)!;
        const existing = dateMap.get(e.date) ?? { count: 0, entries: [] };
        existing.count += 1;
        existing.entries.push({ category: inv.category || "", vat: inv.vat });
        dateMap.set(e.date, existing);
      });
    });

    const invoiceConsumed = new Map<string, number>();
    const matchPayout = (payoutDate: string, vendor: string): { category: string; vat: number } => {
      const v = vendor.toLowerCase().trim();
      const dateMap = managerPayoutByVendor.get(v);
      if (!dateMap) return { category: "", vat: 0 };
      const sameKey = `${v}|${payoutDate}`;
      const sameEntry = dateMap.get(payoutDate);
      const sameAvail = sameEntry ? sameEntry.count - (invoiceConsumed.get(sameKey) ?? 0) : 0;
      if (sameAvail > 0) {
        const idx = invoiceConsumed.get(sameKey) ?? 0;
        invoiceConsumed.set(sameKey, idx + 1);
        return sameEntry!.entries[idx];
      }
      for (const [date, entry] of dateMap) {
        const otherKey = `${v}|${date}`;
        const idx = invoiceConsumed.get(otherKey) ?? 0;
        if (entry.count - idx > 0) {
          invoiceConsumed.set(otherKey, idx + 1);
          return entry.entries[idx];
        }
      }
      return { category: "", vat: 0 };
    };

    // Aggregate all JE2 categories (payouts + EFTs)
    const allCatMap: Record<string, { total: number; totalVat: number }> = {};

    monthlyCashups.forEach((c) => {
      c.shop.payouts.forEach((p) => {
        const match = matchPayout(c.date, p.vendor);
        const cat = match.category || "Uncategorised";
        if (!allCatMap[cat]) allCatMap[cat] = { total: 0, totalVat: 0 };
        allCatMap[cat].total += p.amount;
        allCatMap[cat].totalVat += match.vat;
      });
      if (c.shop.lottoPayouts > 0) {
        const match = matchPayout(c.date, "Lotto");
        const cat = match.category || "Uncategorised";
        if (!allCatMap[cat]) allCatMap[cat] = { total: 0, totalVat: 0 };
        allCatMap[cat].total += c.shop.lottoPayouts;
        allCatMap[cat].totalVat += match.vat;
      }
    });

    monthlyManagers.forEach((e) => {
      e.eftInvoices.forEach((inv) => {
        const cat = inv.category || "Uncategorised";
        if (!allCatMap[cat]) allCatMap[cat] = { total: 0, totalVat: 0 };
        allCatMap[cat].total += inv.inclusive;
        allCatMap[cat].totalVat += inv.vat;
      });
    });

    // COS items: match "COS C Store", "COS WSL DSL", etc.
    const cosMapping = [
      { label: "COS Fuel", key: "COS Fuel" },
      { label: "COS WSL DSL", key: "COS WSL DSL" },
      { label: "COS C Store", key: "COS C Store" },
      { label: "COS Gas", key: "COS Gas" },
      { label: "COS Oil", key: "COS Oil" },
    ];

    // For each COS category, compute Excl VAT (col1) + No VAT (col3)
    const cos = cosMapping.map((c) => {
      const catData = allCatMap[c.key];
      if (!catData) return { description: c.label, amount: 0 };
      const exclVat = catData.totalVat / 0.15;
      const noVat = catData.total - exclVat - catData.totalVat;
      return { description: c.label, amount: exclVat + noVat };
    });
    const totalCOS = cos.reduce((s, r) => s + r.amount, 0);

    const grossProfit = totalSales - totalCOS;

    return { sales, totalSales, cos, totalCOS, grossProfit };
  }, [month, cashups, managerEntries, monthlyFigures]);

  // ── Balance Sheet ──
  const balanceSheet = useMemo(() => {
    // Find the last day of the month
    const monthDate = parseISO(month + "-01");
    const lastDay = format(lastDayOfMonth(monthDate), "yyyy-MM-dd");

    const getEntry = (d: string) => managerEntries.find((e) => e.date === d);
    const getCashup = (d: string) => cashups.find((c) => c.date === d);

    const closing = computeEffectiveClosingForDate(lastDay, getEntry, getCashup);

    const items = [
      { description: "Shift Clearing — Cash Connect", amount: closing?.cc ?? 0 },
      { description: "Shift Clearing — Easypay", amount: closing?.easypay ?? 0 },
      { description: "Shift Clearing — Coins", amount: closing?.coins ?? 0 },
    ];
    const total = items.reduce((s, r) => s + r.amount, 0);

    return { items, total };
  }, [month, cashups, managerEntries]);

  return (
    <div className="space-y-6">
      {/* Income Statement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Income Statement ({month})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Sales Header */}
              <TableRow className="bg-muted/50">
                <TableCell colSpan={2} className="text-sm font-semibold py-1.5">Sales</TableCell>
              </TableRow>
              {incomeStatement.sales.map((r) => (
                <TableRow key={r.description}>
                  <TableCell className="text-sm py-1.5 pl-6">{r.description}</TableCell>
                  <TableCell className="text-right py-1.5">
                    <CurrencyDisplay value={r.amount} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-secondary">
                <TableCell className="text-sm font-semibold py-1.5">Total Sales</TableCell>
                <TableCell className="text-right py-1.5">
                  <CurrencyDisplay value={incomeStatement.totalSales} highlight />
                </TableCell>
              </TableRow>

              {/* COS Header */}
              <TableRow className="bg-muted/50">
                <TableCell colSpan={2} className="text-sm font-semibold py-1.5">Cost of Sales</TableCell>
              </TableRow>
              {incomeStatement.cos.map((r) => (
                <TableRow key={r.description}>
                  <TableCell className="text-sm py-1.5 pl-6">{r.description}</TableCell>
                  <TableCell className="text-right py-1.5">
                    <CurrencyDisplay value={r.amount} />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-secondary">
                <TableCell className="text-sm font-semibold py-1.5">Total Cost of Sales</TableCell>
                <TableCell className="text-right py-1.5">
                  <CurrencyDisplay value={incomeStatement.totalCOS} highlight />
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold text-sm">Gross Profit</TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={incomeStatement.grossProfit} highlight />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Balance Sheet */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance Sheet ({month})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balanceSheet.items.map((r) => (
                <TableRow key={r.description}>
                  <TableCell className="text-sm py-1.5">{r.description}</TableCell>
                  <TableCell className="text-right py-1.5">
                    <CurrencyDisplay value={r.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold text-sm">Total Shift Clearing</TableCell>
                <TableCell className="text-right">
                  <CurrencyDisplay value={balanceSheet.total} highlight />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
