import type { DailyCashup, OtherAdjustment } from '@/types/cashup';

export type AdjLine = {
  date: string;
  adjustmentId: string;
  explanation: string;
  amount: number;
  category: string;
  isNetted: boolean;
};

/** Builds Other Adjustments recon lines (Section 8 + attendant/returns) and flags self-cancelling pairs. */
export function buildOtherAdjustmentLines(monthCashups: DailyCashup[], savedCategories: Record<string, string>): AdjLine[] {
  const allLines: AdjLine[] = [];
  const push = (date: string, id: string, explanation: string, amount: number) => {
    if (Math.abs(amount) < 0.01) return;
    allLines.push({ date, adjustmentId: id, explanation, amount, category: savedCategories[`${date}|${id}`] || '', isNetted: false });
  };
  [...monthCashups].sort((a, b) => a.date.localeCompare(b.date)).forEach(c => {
    ((c.shop.otherAdjustments || []) as OtherAdjustment[]).forEach(adj => push(c.date, adj.id, adj.explanation || '', adj.amount));
    push(c.date, '__attendant_short_over__', 'Attendant Short/(Over)', c.shop.attendantShortOver ?? 0);
    push(c.date, '__returns_not_captured__', 'Returns not captured', c.shop.returnsNotCaptured ?? 0);
    push(c.date, '__returns_mop__', 'Returns MOP (Yesterday)', c.shop.returns_mop ?? 0);
  });

  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].isNetted) continue;
    for (let j = i + 1; j < allLines.length; j++) {
      if (allLines[j].isNetted) continue;
      const a = allLines[i];
      const b = allLines[j];
      if (Math.abs(a.amount + b.amount) < 0.01) {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        const diffDays = Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24);
        const sameExplanation =
          a.explanation.trim().toLowerCase() === b.explanation.trim().toLowerCase() && a.explanation.trim() !== '';
        const crossMatch =
          (a.adjustmentId === '__returns_not_captured__' && b.adjustmentId === '__returns_mop__' && diffDays === 1 && dateB > dateA) ||
          (a.adjustmentId === '__returns_mop__' && b.adjustmentId === '__returns_not_captured__' && diffDays === 1 && dateA > dateB);
        if ((sameExplanation && diffDays <= 1) || crossMatch) {
          allLines[i].isNetted = true;
          allLines[j].isNetted = true;
          break;
        }
      }
    }
  }
  return allLines;
}
