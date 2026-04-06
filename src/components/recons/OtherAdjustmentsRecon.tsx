import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCashupStore } from '@/store/cashupStore';
import { useMasterDataStore } from '@/store/masterDataStore';
import { supabase } from '@/integrations/supabase/client';
import { CurrencyDisplay } from '@/components/ui/CashupUI';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addDays } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import type { OtherAdjustment } from '@/types/cashup';

interface Props {
  filterMonth: string;
}

type AdjLine = {
  date: string;
  adjustmentId: string;
  explanation: string;
  amount: number;
  category: string;
  isNetted: boolean; // returns that net each other off
};

export function OtherAdjustmentsRecon({ filterMonth }: Props) {
  const { cashups } = useCashupStore();
  const { categories } = useMasterDataStore();

  const [savedCategories, setSavedCategories] = useState<Record<string, string>>({});

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('other_adjustment_categories')
      .select('*')
      .eq('month', filterMonth);
    if (data) {
      const map: Record<string, string> = {};
      (data as { cashup_date: string; adjustment_id: string; category: string }[]).forEach(r => {
        map[`${r.cashup_date}|${r.adjustment_id}`] = r.category;
      });
      setSavedCategories(map);
    }
  }, [filterMonth]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const monthCashups = useMemo(
    () => cashups.filter(c => c.month === filterMonth).sort((a, b) => a.date.localeCompare(b.date)),
    [cashups, filterMonth]
  );

  // Build line items and detect returns that net off
  const lines = useMemo(() => {
    const allLines: AdjLine[] = [];

    monthCashups.forEach(c => {
      const adjs = (c.shop.otherAdjustments || []) as OtherAdjustment[];
      adjs.forEach(adj => {
        if (Math.abs(adj.amount) < 0.01) return;
        const key = `${c.date}|${adj.id}`;
        allLines.push({
          date: c.date,
          adjustmentId: adj.id,
          explanation: adj.explanation || '',
          amount: adj.amount,
          category: savedCategories[key] || '',
          isNetted: false,
        });
      });

      // Include Attendant Short/(Over) as a line item
      const attendant = c.shop.attendantShortOver ?? 0;
      if (Math.abs(attendant) >= 0.01) {
        const attKey = `${c.date}|__attendant_short_over__`;
        allLines.push({
          date: c.date,
          adjustmentId: '__attendant_short_over__',
          explanation: 'Attendant Short/(Over)',
          amount: attendant,
          category: savedCategories[attKey] || '',
          isNetted: false,
        });
      }

      // Include Returns not captured as a line item
      const returnsNC = c.shop.returnsNotCaptured ?? 0;
      if (Math.abs(returnsNC) >= 0.01) {
        const rncKey = `${c.date}|__returns_not_captured__`;
        allLines.push({
          date: c.date,
          adjustmentId: '__returns_not_captured__',
          explanation: 'Returns not captured',
          amount: returnsNC,
          category: savedCategories[rncKey] || '',
          isNetted: false,
        });
      }

      // Include Returns MOP (Returns from Yesterday) as a line item
      const returnsMop = c.shop.returns_mop ?? 0;
      if (Math.abs(returnsMop) >= 0.01) {
        const mopKey = `${c.date}|__returns_mop__`;
        allLines.push({
          date: c.date,
          adjustmentId: '__returns_mop__',
          explanation: 'Returns MOP (Yesterday)',
          amount: returnsMop,
          category: savedCategories[mopKey] || '',
          isNetted: false,
        });
      }
    });

    // Detect returns that net each other off on consecutive days
    // 1) Same explanation pairs that cancel out
    // 2) Cross-match: "Returns not captured" on day N nets with "Returns MOP (Yesterday)" on day N+1
    const isReturnsNC = (id: string) => id === '__returns_not_captured__';
    const isReturnsMOP = (id: string) => id === '__returns_mop__';

    for (let i = 0; i < allLines.length; i++) {
      if (allLines[i].isNetted) continue;
      for (let j = i + 1; j < allLines.length; j++) {
        if (allLines[j].isNetted) continue;
        const a = allLines[i];
        const b = allLines[j];

        // Check if amounts cancel
        if (Math.abs(a.amount + b.amount) >= 0.01) continue;

        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        const diffDays = Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24);

        // Case 1: Same explanation, consecutive days
        if (
          diffDays <= 1 &&
          a.explanation.trim().toLowerCase() === b.explanation.trim().toLowerCase() &&
          a.explanation.trim() !== ''
        ) {
          allLines[i].isNetted = true;
          allLines[j].isNetted = true;
          continue;
        }

        // Case 2: Returns not captured (day N) nets with Returns MOP (day N+1)
        const aIsNC = isReturnsNC(a.adjustmentId);
        const bIsMOP = isReturnsMOP(b.adjustmentId);
        const aIsMOP = isReturnsMOP(a.adjustmentId);
        const bIsNC = isReturnsNC(b.adjustmentId);

        if ((aIsNC && bIsMOP) || (aIsMOP && bIsNC)) {
          // Ensure MOP date is exactly 1 day after NC date
          const ncDate = aIsNC ? dateA : dateB;
          const mopDate = aIsMOP ? dateA : dateB;
          const dayDiff = (mopDate.getTime() - ncDate.getTime()) / (1000 * 60 * 60 * 24);
          if (dayDiff >= 0 && dayDiff <= 1) {
            allLines[i].isNetted = true;
            allLines[j].isNetted = true;
          }
        }
      }
    }

    return allLines;
  }, [monthCashups, savedCategories]);

  const handleCategoryChange = async (date: string, adjustmentId: string, category: string) => {
    const key = `${date}|${adjustmentId}`;
    setSavedCategories(prev => ({ ...prev, [key]: category }));

    const { error } = await supabase
      .from('other_adjustment_categories')
      .upsert(
        {
          month: filterMonth,
          cashup_date: date,
          adjustment_id: adjustmentId,
          category,
        } as never,
        { onConflict: 'month,cashup_date,adjustment_id' }
      );

    if (error) {
      toast({ title: 'Error saving category', description: error.message, variant: 'destructive' });
    }
  };

  const formatDate = (d: string) => {
    try { return format(new Date(d), 'dd MMM'); } catch { return d; }
  };

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const nettedTotal = lines.filter(l => l.isNetted).reduce((s, l) => s + l.amount, 0);
  const nonNettedTotal = lines.filter(l => !l.isNetted).reduce((s, l) => s + l.amount, 0);

  // Group by category for summary
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    lines.filter(l => !l.isNetted && l.category).forEach(l => {
      map[l.category] = (map[l.category] || 0) + l.amount;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [lines]);

  const uncategorised = lines.filter(l => !l.isNetted && !l.category);

  return (
    <div className="space-y-4">
      {/* Detail Table */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">Other Adjustments Recon — {filterMonth}</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Date</TableHead>
              <TableHead>Explanation</TableHead>
              <TableHead className="text-right w-28">Amount</TableHead>
              <TableHead className="w-52">Category</TableHead>
              <TableHead className="w-20 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No other adjustments for this month
                </TableCell>
              </TableRow>
            ) : (
              <>
                {lines.map((l, i) => (
                  <TableRow key={i} className={l.isNetted ? 'bg-muted/30 opacity-70' : ''}>
                    <TableCell className="text-sm">{formatDate(l.date)}</TableCell>
                    <TableCell className="text-sm">{l.explanation}</TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay value={l.amount} />
                    </TableCell>
                    <TableCell>
                      {l.isNetted ? (
                        <span className="text-xs text-muted-foreground italic">Netted</span>
                      ) : (
                        <Select
                          value={l.category || '__none__'}
                          onValueChange={(v) => handleCategoryChange(l.date, l.adjustmentId, v === '__none__' ? '' : v)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Select —</SelectItem>
                            {categories.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {l.isNetted ? (
                        <span className="text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">Netted</span>
                      ) : l.category ? (
                        <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5">✓</span>
                      ) : (
                        <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5">?</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-secondary font-semibold">
                  <TableCell colSpan={2}>TOTAL</TableCell>
                  <TableCell className="text-right"><CurrencyDisplay value={total} highlight /></TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Category Summary */}
      {categoryTotals.length > 0 && (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/30">
            <h3 className="font-semibold text-sm">Category Summary</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryTotals.map(([cat, amt]) => (
                <TableRow key={cat}>
                  <TableCell className="text-sm">{cat}</TableCell>
                  <TableCell className="text-right"><CurrencyDisplay value={amt} /></TableCell>
                </TableRow>
              ))}
              {uncategorised.length > 0 && (
                <TableRow>
                  <TableCell className="text-sm text-yellow-600">Uncategorised ({uncategorised.length} items)</TableCell>
                  <TableCell className="text-right"><CurrencyDisplay value={uncategorised.reduce((s, l) => s + l.amount, 0)} /></TableCell>
                </TableRow>
              )}
              <TableRow className="bg-secondary font-semibold">
                <TableCell>NET TOTAL (excl. netted)</TableCell>
                <TableCell className="text-right"><CurrencyDisplay value={nonNettedTotal} highlight /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
