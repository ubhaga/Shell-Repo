import React, { useState } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import { format } from 'date-fns';

export function Reports() {
  const { cashups, managerEntries } = useCashupStore();
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const monthCashups = cashups.filter(c => c.month === filterMonth);
  const monthManagers = managerEntries.filter(e => e.date.startsWith(filterMonth));

  // Payout report
  const payoutReport = monthCashups.flatMap(c =>
    c.shop.payouts.map(p => ({
      date: c.date,
      cashier: c.cashierName,
      vendor: p.vendor,
      amount: p.amount,
    }))
  ).concat(monthCashups.map(c => ({
    date: c.date,
    cashier: c.cashierName,
    vendor: 'Lotto',
    amount: c.shop.lottoPayouts,
  })).filter(r => r.amount > 0));
  const payoutTotal = payoutReport.reduce((s, r) => s + r.amount, 0);

  // Receipts report
  const receiptsReport = monthCashups.flatMap(c =>
    c.shop.receipts.map(r => ({
      date: c.date,
      cashier: c.cashierName,
      type: r.type,
      seqNo: r.seqNo,
      amount: r.amount,
    }))
  );
  const receiptsTotal = receiptsReport.reduce((s, r) => s + r.amount, 0);

  // Speedpoints report — unified per date, grouped by terminal + batch
  type SpUnifiedRow = {
    date: string;
    terminal: string;
    batchNo: string;
    shopAmount: number;
    optAmount: number;
    total: number;
  };
  const speedpointUnified: SpUnifiedRow[] = [];
  monthCashups.forEach(c => {
    // Build a map keyed by "terminal|batchNo"
    const map = new Map<string, { shopAmount: number; optAmount: number }>();
    c.shop.speedpoints.forEach(sp => {
      const key = `${sp.terminal}|${sp.batchNo}`;
      const existing = map.get(key) || { shopAmount: 0, optAmount: 0 };
      existing.shopAmount += sp.shopAmount;
      map.set(key, existing);
    });
    c.opt.speedpoints.forEach(sp => {
      const key = `${sp.terminal}|${sp.batchNo}`;
      const existing = map.get(key) || { shopAmount: 0, optAmount: 0 };
      existing.optAmount += sp.optAmount;
      map.set(key, existing);
    });
    // Convert map to rows, sorted by terminal then batch
    const entries = Array.from(map.entries()).map(([key, val]) => {
      const [terminal, batchNo] = key.split('|');
      return { date: c.date, terminal, batchNo, shopAmount: val.shopAmount, optAmount: val.optAmount, total: val.shopAmount + val.optAmount };
    }).sort((a, b) => a.terminal.localeCompare(b.terminal) || a.batchNo.localeCompare(b.batchNo));
    speedpointUnified.push(...entries);
  });
  const spShopTotal = speedpointUnified.reduce((s, r) => s + r.shopAmount, 0);
  const spOptTotal = speedpointUnified.reduce((s, r) => s + r.optAmount, 0);
  const spGrandTotal = spShopTotal + spOptTotal;

  // Accounts report — shop + OPT combined per day
  const accountsReport = monthCashups.flatMap(c => {
    const shopRows = c.shop.accounts.map(a => ({
      date: c.date,
      cashier: c.cashierName,
      shift: 'Shop' as const,
      name: a.name,
      amount: a.amount,
    }));
    const optRows = c.opt.accounts.map(a => ({
      date: c.date,
      cashier: c.cashierName,
      shift: 'OPT' as const,
      name: a.name,
      amount: a.amount,
    }));
    return [...shopRows, ...optRows];
  });
  const accountsTotal = accountsReport.reduce((s, r) => s + r.amount, 0);

  // Invoice report
  const invoiceReport = monthManagers.flatMap(e => [
    ...e.payoutInvoices.map(i => ({ date: e.date, type: 'Payout', supplier: i.supplier, category: i.category, docNum: i.branchDocNum, inclusive: i.inclusive, vat: i.vat })),
    ...e.eftInvoices.map(i => ({ date: e.date, type: 'EFT', supplier: i.supplier, category: i.category, docNum: i.branchDocNum, inclusive: i.inclusive, vat: i.vat })),
  ]);
  const invoiceTotal = invoiceReport.reduce((s, r) => s + r.inclusive, 0);
  const invoiceVatTotal = invoiceReport.reduce((s, r) => s + r.vat, 0);

  // MOP report — Cash (CC) uses cashConnectTotal from section 5 MOP Cash
  const mopReport = monthCashups.map(c => {
    const shopSP = c.shop.speedpoints.reduce((s, sp) => s + sp.shopAmount, 0);
    const optSP = c.opt.speedpoints.reduce((s, sp) => s + sp.optAmount, 0);
    const shopAcc = c.shop.accounts.reduce((s, a) => s + a.amount, 0);
    const optAcc = c.opt.accounts.reduce((s, a) => s + a.amount, 0);
    // cashConnectTotal = cashDepositedBanking + easyPay + coins (the auto-calculated total in section 5)
    const cash = c.shop.cashConnectTotal;
    return {
      date: c.date,
      cash,
      shopSpeedpoint: shopSP,
      optSpeedpoint: optSP,
      totalSpeedpoint: shopSP + optSP,
      accounts: shopAcc + optAcc,
      total: cash + shopSP + optSP + shopAcc + optAcc,
    };
  });

  const exportCSV = (data: Record<string, string | number>[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => r[h]).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
  };

  const formatDate = (d: string) => {
    try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; }
  };

  const monthLabel = format(new Date(filterMonth + '-01'), 'MMMM yyyy');

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="bg-card border rounded-lg p-3 flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Month:</label>
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="input-cell" />
        <span className="text-sm text-muted-foreground ml-2">
          {monthCashups.length} cashup days · {monthManagers.length} manager entries
        </span>
      </div>

      <Tabs defaultValue="payouts">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="speedpoints">Speedpoints</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="mop">MOP</TabsTrigger>
        </TabsList>

        {/* Payouts */}
        <TabsContent value="payouts">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Detailed Payouts — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(payoutReport, `payouts-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount (Incl.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payoutReport.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No payout data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {payoutReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-sm">{r.cashier}</TableCell>
                        <TableCell className="text-sm">{r.vendor}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.amount} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell colSpan={3}>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={payoutTotal} highlight /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
            {payoutReport.length > 0 && (
              <div className="border-t p-4">
                <h4 className="text-sm font-semibold mb-2">Summary by Vendor</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(
                    payoutReport.reduce((acc, r) => { acc[r.vendor] = (acc[r.vendor] || 0) + r.amount; return acc; }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).map(([vendor, total]) => (
                    <div key={vendor} className="flex justify-between text-sm bg-muted/30 rounded px-2 py-1">
                      <span className="text-muted-foreground truncate mr-2">{vendor}</span>
                      <CurrencyDisplay value={total} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Receipts */}
        <TabsContent value="receipts">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Detailed Receipts — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(receiptsReport, `receipts-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Seq No.</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receiptsReport.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No receipt data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {receiptsReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-sm">{r.cashier}</TableCell>
                        <TableCell className="text-sm">{r.type}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.seqNo}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.amount} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={receiptsTotal} highlight /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
            {receiptsReport.length > 0 && (
              <div className="border-t p-4">
                <h4 className="text-sm font-semibold mb-2">Summary by Type</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(
                    receiptsReport.reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + r.amount; return acc; }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).map(([type, total]) => (
                    <div key={type} className="flex justify-between text-sm bg-muted/30 rounded px-2 py-1">
                      <span className="text-muted-foreground truncate mr-2">{type}</span>
                      <CurrencyDisplay value={total} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Speedpoints */}
        <TabsContent value="speedpoints">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Speedpoint Report — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => {
                const rows = speedpointUnified.map(r => ({
                  Date: r.date,
                  Terminal: r.terminal,
                  'Batch #': r.batchNo,
                  'Shop Amount': r.shopAmount,
                  'OPT Amount': r.optAmount,
                  Total: r.total,
                }));
                exportCSV(rows, `speedpoints-${filterMonth}.csv`);
              }}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Terminal</TableHead>
                  <TableHead>Batch #</TableHead>
                  <TableHead className="text-right">Shop Amount</TableHead>
                  <TableHead className="text-right">OPT Amount</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {speedpointUnified.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No speedpoint data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {/* Group by date for visual separation */}
                    {monthCashups.map(c => {
                      const dateRows = speedpointUnified.filter(r => r.date === c.date);
                      if (dateRows.length === 0) return null;
                      const dateShopTotal = dateRows.reduce((s, r) => s + r.shopAmount, 0);
                      const dateOptTotal = dateRows.reduce((s, r) => s + r.optAmount, 0);
                      const dateTotal = dateRows.reduce((s, r) => s + r.total, 0);
                      return (
                        <React.Fragment key={c.date}>
                          {dateRows.map((r, i) => (
                            <TableRow key={`${r.date}-${r.terminal}-${r.batchNo}-${i}`} className="hover:bg-muted/30">
                              <TableCell className="text-sm font-mono">{i === 0 ? format(new Date(r.date), 'dd MMM') : ''}</TableCell>
                              <TableCell className="text-sm">{r.terminal}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{r.batchNo}</TableCell>
                              <TableCell className="text-right"><CurrencyDisplay value={r.shopAmount} /></TableCell>
                              <TableCell className="text-right"><CurrencyDisplay value={r.optAmount} /></TableCell>
                              <TableCell className="text-right font-semibold"><CurrencyDisplay value={r.total} /></TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/20 border-b-2">
                            <TableCell className="text-xs font-semibold">{format(new Date(c.date), 'dd MMM')} Total</TableCell>
                            <TableCell colSpan={2}></TableCell>
                            <TableCell className="text-right text-xs font-semibold"><CurrencyDisplay value={dateShopTotal} /></TableCell>
                            <TableCell className="text-right text-xs font-semibold"><CurrencyDisplay value={dateOptTotal} /></TableCell>
                            <TableCell className="text-right text-xs font-semibold"><CurrencyDisplay value={dateTotal} /></TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                    <TableRow className="bg-secondary font-semibold border-t-2">
                      <TableCell colSpan={3}>GRAND TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={spShopTotal} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={spOptTotal} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={spGrandTotal} highlight /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Accounts */}
        <TabsContent value="accounts">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Accounts Report — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(accountsReport, `accounts-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountsReport.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No accounts data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {accountsReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-sm">{r.cashier}</TableCell>
                        <TableCell>
                          <span className={`text-xs rounded px-1.5 py-0.5 ${r.shift === 'Shop' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>{r.shift}</span>
                        </TableCell>
                        <TableCell className="text-sm">{r.name}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.amount} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={accountsTotal} highlight /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
            {accountsReport.length > 0 && (
              <div className="border-t p-4">
                <h4 className="text-sm font-semibold mb-2">Summary by Account</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(
                    accountsReport.reduce((acc, r) => { acc[r.name] = (acc[r.name] || 0) + r.amount; return acc; }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).map(([name, total]) => (
                    <div key={name} className="flex justify-between text-sm bg-muted/30 rounded px-2 py-1">
                      <span className="text-muted-foreground truncate mr-2">{name}</span>
                      <CurrencyDisplay value={total} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Detailed Invoices — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(invoiceReport, `invoices-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Doc No.</TableHead>
                  <TableHead className="text-right">Inclusive</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceReport.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No invoice data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {invoiceReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell><span className={`text-xs rounded px-1.5 py-0.5 ${r.type === 'Payout' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{r.type}</span></TableCell>
                        <TableCell className="text-sm">{r.supplier}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.category}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.docNum}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.inclusive} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.vat} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell colSpan={5}>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={invoiceTotal} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={invoiceVatTotal} /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* MOP */}
        <TabsContent value="mop">
          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">Method of Payment Report — {monthLabel}</h3>
              <Button size="sm" variant="outline" onClick={() => exportCSV(mopReport, `mop-${filterMonth}.csv`)}>
                <Download className="h-3.5 w-3.5 mr-1" />Export CSV
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Cash (CC)</TableHead>
                  <TableHead className="text-right">Shop SP</TableHead>
                  <TableHead className="text-right">OPT SP</TableHead>
                  <TableHead className="text-right">Total SP</TableHead>
                  <TableHead className="text-right">Accounts</TableHead>
                  <TableHead className="text-right">Total MOP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mopReport.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No data for this month</TableCell></TableRow>
                ) : (
                  <>
                    {mopReport.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.cash} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.shopSpeedpoint} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.optSpeedpoint} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.totalSpeedpoint} /></TableCell>
                        <TableCell className="text-right"><CurrencyDisplay value={r.accounts} /></TableCell>
                        <TableCell className="text-right font-semibold"><CurrencyDisplay value={r.total} highlight /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary font-semibold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.cash, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.shopSpeedpoint, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.optSpeedpoint, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.totalSpeedpoint, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.accounts, 0)} highlight /></TableCell>
                      <TableCell className="text-right"><CurrencyDisplay value={mopReport.reduce((s, r) => s + r.total, 0)} highlight /></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
